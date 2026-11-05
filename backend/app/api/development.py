import logging
from uuid import UUID
import httpx
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


from app.agents.development.runner import (
    run_development_workflow,
)

from app.api.patches import (
    get_patch_store,
    require_local_environment,
)

from app.core import get_settings
from app.llm.factory import LLMProviderFactory
from app.llm.store import LLMSelectionStore
from app.patches.preview import preview_patch
from app.patches.store import PatchProposalStore


from app.repositories.resolver import (
    resolve_registered_repository,
)

from app.repositories.store import RepositoryStore



logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/development",
    tags=["Development Workflows"],
)

class DevelopmentWorkflowRequest(BaseModel):
    repository_id: UUID
    file_path: str = Field(min_length=1)
    instruction: str = Field(min_length=10, max_length=1000)


class DevelopmentWorkflowResponse(BaseModel):
    workflow_status: str
    developer_status: str
    developer_feedback: str
    review_passed: bool
    review_feedback: str
    qa_passed: bool
    qa_feedback: str
    error: str | None = None
    proposal_id: UUID | None = None
    diff: str | None = None

@router.post(
    "/workflows",
    response_model=DevelopmentWorkflowResponse,
)
def create_development_workflow(
    request: DevelopmentWorkflowRequest,
    store: PatchProposalStore = Depends(get_patch_store),
):
    require_local_environment()

    repository = resolve_registered_repository(
        repository_id=str(request.repository_id),
        store=RepositoryStore(),
    )

    selection = LLMSelectionStore().get(
        fallback=get_settings().llm_selection
    )

    provider = LLMProviderFactory(selection).create_text_provider()

    try:
        result = run_development_workflow(
           repository_id=str(request.repository_id),
           repository_root=Path(repository.path).resolve(),
           file_path=request.file_path,
           instruction=request.instruction,
           generate_text=provider.generate,
        )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Development workflow timed out",
        ) from None

    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="LLM provider is unavailable",
        ) from None

    except (OSError, ValueError, UnicodeError):
        logger.exception("Development workflow failed")
        raise HTTPException(
            status_code=422,
            detail="Development workflow could not complete",
        ) from None

    response = DevelopmentWorkflowResponse(
        workflow_status=result["workflow_status"],
        developer_status=result["developer_status"],
        developer_feedback=result["developer_feedback"],
        review_passed=result["review_passed"],
        review_feedback=result["review_feedback"],
        qa_passed=result["qa_passed"],
        qa_feedback=result["qa_feedback"],
        error=result.get("error"),
    )

    if result["workflow_status"] != "ready_for_approval":
        return response

    proposal = result.get("proposal")
    
    if proposal is None:
        raise HTTPException(
            status_code=500,
            detail="Workflow completed without a proposal",
        )

    try:
        diff = preview_patch(
            repository_root=Path(repository.path).resolve(),
            proposal=proposal,
        )

        if not diff.strip():
            raise ValueError("Proposal contains no changes")
    except (OSError, ValueError, UnicodeError):
        raise HTTPException(
            status_code=409,
            detail="Proposal is no longer valid",
        ) from None

    saved = store.create(proposal)

    response.proposal_id = UUID(saved["id"])
    response.diff = diff

    return response