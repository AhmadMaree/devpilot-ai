import logging
from functools import lru_cache
from uuid import UUID

import httpx
from azure.core.exceptions import HttpResponseError
from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as gemini_errors

from app.agents.graph import build_investigation_graph
from app.agents.models import (
    InvestigationRequest,
    InvestigationResponse,
    InvestigationSource,
    InvestigationSummary,
    SavedInvestigation,
)
from app.agents.retriever import RepositoryRetriever
from app.core import get_settings
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.llm.factory import LLMProviderFactory
from app.llm.models import LLMSelection
from app.llm.store import LLMSelectionStore
from app.repositories.index_service import (
    RepositoryIndexNotFoundError,
)
from app.repositories.resolver import resolve_registered_repository
from app.repositories.store import RepositoryStore
from app.retrieval.factory import (
    create_repository_search,
    get_active_index_version,
    get_retrieval_backend,
)
from app.storage.investigations import InvestigationStore

router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])
logger = logging.getLogger(__name__)


@lru_cache(maxsize=16)
def get_investigation_graph(
    repository_id: UUID,
    provider: str,
    model: str,
    index_version: str,
    retrieval_backend: str,
):
    retriever = RepositoryRetriever(
        index=create_repository_search(
            repository_id=repository_id,
            backend=retrieval_backend,
        ),
        embeddings=OllamaEmbeddingProvider(),
        index_version=index_version,
    )

    selection = LLMSelection(
        provider=provider,
        model=model,
    )

    analyst = LLMProviderFactory(selection).create_text_provider()

    return build_investigation_graph(
        retriever=retriever,
        analyst=analyst,
    )


def get_investigation_store() -> InvestigationStore:
    store = InvestigationStore()
    store.initialize()
    return store


@router.post("/investigate", response_model=SavedInvestigation)
def investigate(
    request: InvestigationRequest,
    store: InvestigationStore = Depends(get_investigation_store),
) -> SavedInvestigation:
    settings = get_settings()

    if settings.environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local agent API is disabled",
        )

    repository = resolve_registered_repository(
        request.repository_id,
        RepositoryStore(),
    )

    selection = LLMSelectionStore().get(fallback=settings.llm_selection)
    try:
        retrieval_backend = get_retrieval_backend()
        active_version = get_active_index_version(repository.id, retrieval_backend)
        graph = get_investigation_graph(
            repository_id=repository.id,
            provider=selection.provider.value,
            model=selection.model,
            index_version=active_version,
            retrieval_backend=retrieval_backend,
        )

        result = graph.invoke(
            {
                "repository_id": str(repository.id),
                "question": request.question,
                "plan": "",
                "answer": "",
                "evidence": [],
                "attempts": 0,
                "max_attempts": 3,
                "review_feedback": "",
                "review_passed": False,
            }
        )

    except RepositoryIndexNotFoundError:
        raise HTTPException(
            status_code=409,
            detail="Repository index is unavailable",
        ) from None

    except httpx.TimeoutException:
        logger.exception("Investigation AI request timed out")
        raise HTTPException(
            status_code=504,
            detail="AI service timed out",
        ) from None

    except httpx.HTTPError:
        logger.exception("Investigation AI request failed")
        raise HTTPException(
            status_code=503,
            detail="AI service is unavailable",
        ) from None

    except gemini_errors.APIError:
        logger.exception("Gemini investigation request failed")
        raise HTTPException(
            status_code=503,
            detail="Gemini AI service request failed",
        ) from None

    except HttpResponseError:
        raise HTTPException(
            status_code=503,
            detail="Azure AI Search is unavailable",
        ) from None

    except (OSError, ValueError, KeyError):
        logger.exception("Investigation failed")
        raise HTTPException(
            status_code=503,
            detail="Investigation could not be completed",
        ) from None

    investigation_result = InvestigationResponse(
        repository_id=str(repository.id),
        question=request.question,
        plan=result["plan"],
        answer=result["answer"],
        review_passed=result["review_passed"],
        review_feedback=result["review_feedback"],
        attempts=result["attempts"],
        sources=[
            InvestigationSource(
                source_id=item["source_id"],
                chunk_id=item["chunk_id"],
                file_path=item["file_path"],
                start_line=item["start_line"],
                end_line=item["end_line"],
                commit_sha=item["commit_sha"],
                snippet=item["content"],
            )
            for item in result["evidence"]
        ],
    )

    saved = store.save(investigation_result)

    return SavedInvestigation.model_validate(saved)


@router.get(
    "/investigations",
    response_model=list[InvestigationSummary],
)
def list_investigations(
    store: InvestigationStore = Depends(get_investigation_store),
) -> list[InvestigationSummary]:
    if get_settings().environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local agent API is disabled",
        )

    return [
        InvestigationSummary.model_validate(item)
        for item in store.list_recent(limit=20)
    ]


@router.get(
    "/investigations/{investigation_id}",
    response_model=SavedInvestigation,
)
def get_investigation(
    investigation_id: UUID,
    store: InvestigationStore = Depends(get_investigation_store),
) -> SavedInvestigation:
    if get_settings().environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local agent API is disabled",
        )

    saved = store.get_investigation(str(investigation_id))

    if saved is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found",
        )

    return SavedInvestigation.model_validate(saved)
