
from functools import lru_cache
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException

from app.core import get_settings
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.llm.factory import LLMProviderFactory
from app.llm.models import LLMSelection
from app.llm.store import LLMSelectionStore
from app.rag.models import QuestionRequest, QuestionsAnswer
from app.rag.service import RAGServices
from app.repositories.index_service import (
    RepositoryIndexNotFoundError,
    load_repository_index,
)
from app.repositories.resolver import resolve_registered_repository
from app.repositories.store import RepositoryStore


router = APIRouter(prefix="/api/v1", tags=["Questions"])


@lru_cache(maxsize=16)
def get_rag_services(
    repository_id: UUID,
    provider: str,
    model: str,
    index_version: int,
) -> RAGServices:
    selection = LLMSelection(
        provider=provider,
        model=model,
    )

    return RAGServices(
        index=load_repository_index(repository_id),
        embeddings=OllamaEmbeddingProvider(),
        chat=LLMProviderFactory(
            selection
        ).create_text_provider(),
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

    selection = LLMSelectionStore().get(
        fallback=settings.llm_selection
    )

    try:
        # File modification time invalidates the cached
        # service after a successful atomic index replacement.
        from app.repositories.index_paths import (
            get_repository_index_path,
        )

        index_path = get_repository_index_path(repository.id)

        if not index_path.is_file():
            raise RepositoryIndexNotFoundError()

        return get_rag_services(
            repository_id=repository.id,
            provider=selection.provider.value,
            model=selection.model,
            index_version=index_path.stat().st_mtime_ns,
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

    except (ValueError, KeyError, OSError):
        raise HTTPException(
            status_code=503,
            detail="RAG service could not complete the request",
        ) from None
