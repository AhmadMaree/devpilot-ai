from functools import lru_cache
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

from app.core import get_settings
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.rag.models import QuestionRequest, QuestionsAnswer
from app.rag.ollama import OllamaChatProvider
from app.rag.service import RAGServices
from app.retrieval.local_index import LocalVectorIndex

router = APIRouter(prefix="/api/v1", tags=["Questions"])

##Local index
INDEX_PATH = Path(__file__).resolve().parents[2] / "data" / "local_index.json"


@lru_cache
def get_rag_services() -> RAGServices:

    return RAGServices(
        index=LocalVectorIndex.load(INDEX_PATH),
        embeddings=OllamaEmbeddingProvider(),
        chat=OllamaChatProvider(),
    )


@router.post("/questions", response_model=QuestionsAnswer)
def ask_question(request: QuestionRequest) -> QuestionsAnswer:
    settings = get_settings()

    if settings.environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local RAG is disabled",
        )

    if request.repository_id != "demo-repository":
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    if not INDEX_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail="Local search index is unavailable",
        )

    try:
        return get_rag_services().answer(
            repository_id=request.repository_id, question=request.question, top_k=5
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Local AI server timeout") from None
    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Local AI service is unavailable",
        ) from None
    except (ValueError, KeyError, OSError):
        raise HTTPException(
            status_code=503,
            detail="RAG service could not complete the request",
        ) from None
