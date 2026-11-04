from pathlib import Path
from uuid import UUID
import logging
import httpx

from pydantic import BaseModel
from uuid import UUID
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends

from app.patches.store import PatchProposalStore, PatchProposal
from app.core import get_settings
from app.patches.preview import preview_patch
from app.patches.service import apply_approved_patch

from app.patches.generation import (
    GeneratePatchRequest,
    generate_patch
)

from app.llm.factory import LLMProviderFactory
from app.llm.store import LLMSelectionStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/patches", tags=["Patches"])


class PatchCreateResponse(BaseModel):
    id: UUID
    status: str
    created_at: str
    diff: str


class PatchActionResponse(BaseModel):
    id: UUID
    status: str
    message: str

def get_patch_store() -> PatchProposalStore:
    require_local_environment()

    store = PatchProposalStore()
    store.initialize()
    return store

def require_local_environment() -> None:
    if get_settings().environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Patch API is disabled",
        )

def get_repository_root() -> Path:
    return Path(get_settings().demo_repository_path).resolve()

@router.post(
    "/proposals",
    response_model=PatchCreateResponse
)
def create_proposals(
    request: PatchProposal,
    store: PatchProposalStore = Depends(get_patch_store)
):
    require_local_environment()
    root = get_repository_root()

    if request.repository_id != "demo-repository":
        raise HTTPException(404, "Repository not found")

    try:
        diff = preview_patch(root, request)
    except(OSError, ValueError, UnicodeError) as err:
        raise HTTPException(400, str(err)) from None

    if not diff:
        raise HTTPException(400, "Patch contains no changes")

    saved = store.create(request)

    return PatchCreateResponse(
        **saved,
        diff=diff
    )


@router.get("/proposals/{proposal_id}")
def get_proposal(
    proposal_id: UUID,
    store: PatchProposalStore = Depends(get_patch_store),
):
    require_local_environment()
    proposal = store.get(str(proposal_id))

    if not proposal:
        raise HTTPException(404, "Patch proposal not found")

    return {
        "id": proposal["id"],
        "repository_id": proposal["repository_id"],
        "file_path": proposal["file_path"],
        "explanation": proposal["explanation"],
        "status": proposal["status"],
        "created_at": proposal["created_at"],
    }

@router.post(
    "/proposals/{proposal_id}/reject",
    response_model=PatchActionResponse,
)
def reject_proposal(
    proposal_id: UUID,
    store: PatchProposalStore = Depends(get_patch_store),
):
    require_local_environment()
    
    if store.get(str(proposal_id)) is None:
        raise HTTPException(404, "Patch proposal not found")

    changed = store.set_status(
        str(proposal_id),
        expected_status="pending",
        new_status="rejected",
    )

    if not changed:
        raise HTTPException(
            409,
            "Proposal is no longer pending",
        )

    return PatchActionResponse(
        id=proposal_id,
        status="rejected",
        message="Proposal rejected; no files changed",
    )

@router.post(
    "/proposals/{proposal_id}/approve",
    response_model=PatchActionResponse
)
def approve_proposal(
    proposal_id: UUID,
    store: PatchProposalStore = Depends(get_patch_store)
):
    require_local_environment()

    propsal = store.get(str(proposal_id))

    if not propsal:
        raise HTTPException(404, "proposal_id not found")

    if not store.claim_for_apply(str(proposal_id)):
        raise HTTPException(
            status_code=409,
            detail="Proposal is no longer pending",
        )

    try:
        updatePoposal = PatchProposal(
                repository_id=propsal["repository_id"],
                file_path=propsal["file_path"],
                expected_sha256=propsal["expected_sha256"],
                replacement_content=propsal["replacement_content"],
                explanation=propsal["explanation"],
            )
        
        root = get_repository_root()
        
        res = apply_approved_patch(
            repository_root=root,
            proposal=updatePoposal,
            approved=True
        )

        if not res.applied:
            raise ValueError(res.message)
        
    except (OSError, ValueError, UnicodeError) as err:
        store.set_status(
            str(proposal_id),
            expected_status="applying",
            new_status="failed",
        )
        raise HTTPException(409, str(err)) from None

    changed = store.set_status(
        proposal_id= str(proposal_id),
        expected_status="applying",
        new_status="applied",
    )

    if not changed:
        raise HTTPException(
            status_code=500,
            detail=(
                "Patch may have been applied, but its status "
                "could not be recorded. Manual inspection required."
            ),
        )
    
    return PatchActionResponse(
        id=proposal_id,
        status="applied",
        message=res.message,
    )


@router.get("/proposals/{proposal_id}/preview")
def get_proposal_preview(
    proposal_id: UUID,
    store: PatchProposalStore = Depends(get_patch_store),
):
    require_local_environment()
    saved = store.get(str(proposal_id))

    if saved is None:
        raise HTTPException(
            status_code=404,
            detail="Patch proposal not found",
        )

    proposal = PatchProposal(
        repository_id=saved["repository_id"],
        file_path=saved["file_path"],
        expected_sha256=saved["expected_sha256"],
        replacement_content=saved["replacement_content"],
        explanation=saved["explanation"],
    )

    try:
        diff = preview_patch(
            get_repository_root(),
            proposal,
        )
    except (OSError, ValueError, UnicodeError) as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from None

    return {
        "id": saved["id"],
        "repository_id": saved["repository_id"],
        "file_path": saved["file_path"],
        "explanation": saved["explanation"],
        "status": saved["status"],
        "diff": diff,
    }

@router.post("/generate")
def generate_patch_proposal(
    request: GeneratePatchRequest,
    store: PatchProposalStore = Depends(get_patch_store)
):
    require_local_environment()

    if request.repository_id != "demo-repository":
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    selection = LLMSelectionStore().get(
        fallback=get_settings().llm_selection
    )

    provider = LLMProviderFactory(selection).create_patch_provider()

    try:
        proposal = generate_patch(
            repository_root=get_repository_root(),
            request=request,
            generate_text=provider.generate,
        )

        diff = preview_patch(
            repository_root=get_repository_root(),
            proposal=proposal
        )

        if not diff:
            raise ValueError(
                "Generated proposal contains no changes"
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Developer Agent timed out",
        ) from None

    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Ollama is unavailable",
        ) from None

    except (OSError, ValueError, UnicodeError):
        logger.exception(
            "Developer Agent failed to generate a valid patch"
        )
        raise HTTPException(
            status_code=422,
            detail="Developer Agent could not produce a valid patch",
        ) from None

    saved = store.create(proposal)
    return {
        **saved,
        "diff": diff,
    }

    