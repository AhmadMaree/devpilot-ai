from functools import lru_cache
from uuid import UUID

import httpx
from azure.core.exceptions import HttpResponseError
from fastapi import APIRouter, HTTPException

from app.core import get_settings
from app.embeddings.factory import (
    create_embedding_provider,
    get_embedding_provider_name
)
from app.llm.factory import LLMProviderFactory
from app.llm.models import LLMSelection
from app.rag.models import QuestionRequest, QuestionsAnswer
from app.rag.service import RAGServices
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
from app.llm.selection import get_effective_llm_selection

router = APIRouter(prefix="/api/v1", tags=["Questions"])


@lru_cache(maxsize=16)
def get_rag_services(
    repository_id: UUID,
    provider: str,
    model: str,
    index_version: str,
    retrieval_backend: str,
    embedding_provider: str,
) -> RAGServices:
    selection = LLMSelection(
        provider=provider,
        model=model,
    )

    return RAGServices(
        index=create_repository_search(
            repository_id=repository_id,
            backend=retrieval_backend,
        ),
        embeddings=create_embedding_provider(),
        chat=LLMProviderFactory(selection).create_text_provider(),
        index_version=index_version,
    )


@router.post(
    "/questions",
    response_model=QuestionsAnswer,
)
def ask_question(
    request: QuestionRequest,
) -> QuestionsAnswer:
    settings = get_settings()

    if settings.environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local RAG is disabled",
        )

    repository = resolve_registered_repository(
        request.repository_id,
        RepositoryStore(),
    )

    selection = get_effective_llm_selection()

    try:
        retrieval_backend = get_retrieval_backend()
        active_version = get_active_index_version(repository.id, retrieval_backend)

        return get_rag_services(
            repository_id=repository.id,
            provider=selection.provider.value,
            model=selection.model,
            index_version=active_version,
            retrieval_backend=retrieval_backend,
            embedding_provider=get_embedding_provider_name(),
        ).answer(
            repository_id=str(repository.id),
            question=request.question,
            top_k=5,
        )

    except RepositoryIndexNotFoundError:
        raise HTTPException(
            status_code=409,
            detail="Repository has not been indexed",
        ) from None

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="AI service timed out",
        ) from None

    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="AI service is unavailable",
        ) from None

    except HttpResponseError:
        raise HTTPException(
            status_code=503,
            detail="Azure AI Search is unavailable",
        ) from None

    except (ValueError, KeyError, OSError):
        raise HTTPException(
            status_code=503,
            detail="RAG service could not complete the request",
        ) from None
