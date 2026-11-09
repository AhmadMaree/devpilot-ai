import logging
import os
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core import get_settings
from app.llm.factory import LLMProviderFactory
from app.llm.postgres_store import PostgresLLMSelectionStore
from app.patches.generation import GeneratePatchRequest, generate_patch
from app.patches.preview import preview_patch
from app.patches.service import apply_approved_patch
from app.patches.models import PatchProposal
from app.patches.postgres_store import PostgresPatchProposalStore
from app.repositories.resolver import resolve_registered_repository
from app.repositories.postgres_store import PostgresRepositoryStore
from app.repositories.checkout import (
    ensure_repository_checkout,
    RepositoryCheckoutUnavailableError,
)
from app.storage.repository_snapshots import (
    AzureRepositorySnapshotStore,
)

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


class PatchProposalSummary(BaseModel):
    id: UUID
    repository_id: UUID
    file_path: str
    explanation: str
    status: str
    created_at: str


def get_patch_store() -> PostgresPatchProposalStore:
    require_local_environment()

    store = PostgresPatchProposalStore()
    store.initialize()
    return store


def require_local_environment() -> None:
    if get_settings().environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Patch API is disabled",
        )


def get_repository_root(repository_id: str) -> Path:
    repository = resolve_registered_repository(
        repository_id=repository_id, store=PostgresRepositoryStore()
    )
    try:
        return ensure_repository_checkout(repository)
    except RepositoryCheckoutUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail="Repository checkout is unavailable",
        ) from exc

@router.post("/proposals", response_model=PatchCreateResponse)
def create_proposals(
    request: PatchProposal, store: PostgresPatchProposalStore = Depends(get_patch_store)
):
    require_local_environment()
    root = get_repository_root(request.repository_id)

    try:
        diff = preview_patch(root, request)
    except (OSError, ValueError, UnicodeError) as err:
        raise HTTPException(400, str(err)) from None

    if not diff:
        raise HTTPException(400, "Patch contains no changes")

    saved = store.create(request, diff=diff)

    return PatchCreateResponse(**saved, diff=diff)


@router.get("/proposals", response_model=list[PatchProposalSummary])
def list_proposals(
    repository_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    store: PostgresPatchProposalStore = Depends(get_patch_store),
):
    require_local_environment()
    get_repository_root(str(repository_id))

    return store.list_by_repository(
        repository_id=str(repository_id), limit=limit, offset=offset
    )


@router.get("/proposals/{proposal_id}")
def get_proposal(
    proposal_id: UUID,
    store: PostgresPatchProposalStore = Depends(get_patch_store),
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
    store: PostgresPatchProposalStore = Depends(get_patch_store),
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


@router.post("/proposals/{proposal_id}/approve", response_model=PatchActionResponse)
def approve_proposal(
    proposal_id: UUID, store: PostgresPatchProposalStore = Depends(get_patch_store)
):
    require_local_environment()

    propsal = store.get(str(proposal_id))

    if not propsal:
        raise HTTPException(404, "proposal_id not found")

    root = get_repository_root(propsal["repository_id"])

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

        res = apply_approved_patch(
            repository_root=root, proposal=updatePoposal, approved=True
        )

        if not res.applied:
            raise ValueError(res.message)

        blob_enabled = (
            os.getenv("AZURE_BLOB_ENABLED", "false")
            .strip()
            .lower()
            == "true"
        )

        if blob_enabled:
            managed_checkout = (
                root.name.startswith("github-")
                and len(root.name) == 39
            )

            if not managed_checkout:
                raise RuntimeError(
                    "Approved patches require a managed "
                    "GitHub checkout when Blob Storage "
                    "persistence is enabled."
                )

            snapshot_store = AzureRepositorySnapshotStore()

            snapshot_store.upload_updated_checkout(
                repository_path=root,
            )



    except (OSError, ValueError, UnicodeError) as err:
        store.set_status(
            str(proposal_id),
            expected_status="applying",
            new_status="failed",
        )
        raise HTTPException(409, str(err)) from None

    except Exception:
        logger.exception(
            "Patch %s may have changed local files, "
            "but durable persistence was not confirmed",
            proposal_id,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Patch persistence could not be confirmed. "
                "The proposal requires reconciliation "
                "before another approval attempt."
            ),
        ) from None

    

    changed = store.set_status(
        proposal_id=str(proposal_id),
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
    store: PostgresPatchProposalStore = Depends(get_patch_store),
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

    status = saved["status"]

    response = {
        "id": saved["id"],
        "repository_id": saved["repository_id"],
        "file_path": saved["file_path"],
        "explanation": saved["explanation"],
        "status": status,
        "diff": saved.get("diff"),
    }

    if status in ("applied", "rejected", "failed"):
        return response

    # Only pending proposals should be previewed
    # against the current repository file.
    if status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Proposal cannot be previewed in status '{status}'",
        )

    try:
        current_diff = preview_patch(
            get_repository_root(proposal.repository_id),
            proposal,
        )

    except (OSError, ValueError, UnicodeError) as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from None

    response["diff"] = current_diff

    return response


@router.post("/generate")
def generate_patch_proposal(
    request: GeneratePatchRequest, store: PostgresPatchProposalStore = Depends(get_patch_store)
):
    require_local_environment()

    selection = PostgresLLMSelectionStore().get(fallback=get_settings().llm_selection)

    provider = LLMProviderFactory(selection).create_patch_provider()

    try:
        proposal = generate_patch(
            repository_root=get_repository_root(request.repository_id),
            request=request,
            generate_text=provider.generate,
        )

        diff = preview_patch(
            repository_root=get_repository_root(request.repository_id),
            proposal=proposal,
        )

        if not diff:
            raise ValueError("Generated proposal contains no changes")
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
        logger.exception("Developer Agent failed to generate a valid patch")
        raise HTTPException(
            status_code=422,
            detail="Developer Agent could not produce a valid patch",
        ) from None

    saved = store.create(proposal, diff=diff)
    return {
        **saved,
        "diff": diff,
    }
