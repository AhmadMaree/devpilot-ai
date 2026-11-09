import logging
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.agents.development.runner import run_development_workflow
from app.api.patches import get_patch_store, require_local_environment
from app.core import get_settings
from app.llm.factory import LLMProviderFactory
from app.llm.postgres_store import PostgresLLMSelectionStore
from app.patches.preview import preview_patch
from app.patches.postgres_store import PostgresPatchProposalStore
from app.repositories.resolver import resolve_registered_repository
from app.repositories.postgres_store import PostgresRepositoryStore
from app.storage.postgres_development_workflows import PostgresDevelopmentWorkflowStore
from app.repositories.checkout import (
    ensure_repository_checkout,
    RepositoryCheckoutUnavailableError,
)

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


class DevelopmentWorkflowSummary(BaseModel):
    id: UUID
    repository_id: UUID
    file_path: str
    instruction: str
    status: str
    proposal_id: UUID | None = None
    created_at: str


class DevelopmentWorkflowDetail(DevelopmentWorkflowSummary):
    response: dict


def get_workflow_store() -> PostgresDevelopmentWorkflowStore:
    require_local_environment()
    store = PostgresDevelopmentWorkflowStore()
    store.initialize()
    return store


def save_workflow_history(
    *,
    history_store: PostgresDevelopmentWorkflowStore,
    request: DevelopmentWorkflowRequest,
    response: DevelopmentWorkflowResponse,
) -> None:
    history_store.create(
        repository_id=request.repository_id,
        file_path=request.file_path,
        instruction=request.instruction,
        status=response.workflow_status,
        proposal_id=response.proposal_id,
        response=response.model_dump(mode="json"),
    )


def failed_response(message: str) -> DevelopmentWorkflowResponse:
    return DevelopmentWorkflowResponse(
        workflow_status="failed",
        developer_status="failed",
        developer_feedback=message,
        review_passed=False,
        review_feedback="Review did not complete",
        qa_passed=False,
        qa_feedback="QA did not complete",
        error=message,
    )


@router.post(
    "/workflows",
    response_model=DevelopmentWorkflowResponse,
)
def create_development_workflow(
    request: DevelopmentWorkflowRequest,
    store: PostgresPatchProposalStore = Depends(get_patch_store),
    history_store: PostgresDevelopmentWorkflowStore = Depends(get_workflow_store),
):
    require_local_environment()

    repository = resolve_registered_repository(
        repository_id=str(request.repository_id),
        store=PostgresRepositoryStore(),
    )

    try:
        repository_root = ensure_repository_checkout(repository)
    except RepositoryCheckoutUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail="Repository checkout is unavailable",
        ) from exc

    try:
        selection = PostgresLLMSelectionStore().get(fallback=get_settings().llm_selection)

        provider = LLMProviderFactory(selection).create_patch_provider()

        result = run_development_workflow(
            repository_id=str(request.repository_id),
            repository_root=repository_root,
            file_path=request.file_path,
            instruction=request.instruction,
            generate_text=provider.generate,
        )

    except httpx.TimeoutException:
        message = "Development workflow timed out"
        save_workflow_history(
            history_store=history_store,
            request=request,
            response=failed_response(message),
        )
        raise HTTPException(
            status_code=504,
            detail=message,
        ) from None

    except httpx.HTTPError:
        message = "LLM provider is unavailable"
        save_workflow_history(
            history_store=history_store,
            request=request,
            response=failed_response(message),
        )
        raise HTTPException(
            status_code=503,
            detail=message,
        ) from None

    except (OSError, ValueError, UnicodeError):
        logger.exception("Development workflow failed")

        message = "Development workflow could not complete"
        save_workflow_history(
            history_store=history_store,
            request=request,
            response=failed_response(message),
        )
        raise HTTPException(
            status_code=422,
            detail=message,
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
        save_workflow_history(
            history_store=history_store,
            request=request,
            response=response,
        )
        return response

    proposal = result.get("proposal")

    if proposal is None:
        message = "Workflow completed without a proposal"
        response.workflow_status = "failed"
        response.error = message

        save_workflow_history(
            history_store=history_store,
            request=request,
            response=response,
        )

        raise HTTPException(
            status_code=500,
            detail=message,
        )

    try:
        diff = preview_patch(
            repository_root=repository_root,
            proposal=proposal,
        )

        if not diff.strip():
            raise ValueError("Proposal contains no changes")

    except (OSError, ValueError, UnicodeError):
        message = "Proposal is no longer valid"
        response.workflow_status = "failed"
        response.error = message

        save_workflow_history(
            history_store=history_store,
            request=request,
            response=response,
        )

        raise HTTPException(
            status_code=409,
            detail=message,
        ) from None

    saved = store.create(proposal, diff=diff)

    response.proposal_id = UUID(saved["id"])
    response.diff = diff

    save_workflow_history(
        history_store=history_store,
        request=request,
        response=response,
    )

    return response


@router.get(
    "/workflows",
    response_model=list[DevelopmentWorkflowSummary],
)
def list_development_workflows(
    repository_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    history_store: PostgresDevelopmentWorkflowStore = Depends(get_workflow_store),
):
    require_local_environment()

    resolve_registered_repository(
        repository_id=str(repository_id),
        store=PostgresRepositoryStore(),
    )

    return history_store.list_by_repository(
        repository_id=repository_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/workflows/{workflow_id}",
    response_model=DevelopmentWorkflowDetail,
)
def get_development_workflow(
    workflow_id: UUID,
    history_store: PostgresDevelopmentWorkflowStore = Depends(get_workflow_store),
):
    require_local_environment()

    workflow = history_store.get(workflow_id)

    if workflow is None:
        raise HTTPException(
            status_code=404,
            detail="Development workflow not found",
        )

    resolve_registered_repository(
        repository_id=workflow["repository_id"],
        store=PostgresRepositoryStore(),
    )

    return workflow
