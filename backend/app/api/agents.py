import logging
from functools import lru_cache
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException

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
from app.llm.factory import OllamaChatProvider, LLMProviderFactory
from app.llm.models import LLMSelection
from app.llm.store import LLMSelectionStore
from app.retrieval.local_index import LocalVectorIndex
from app.storage.investigations import InvestigationStore

router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])
logger = logging.getLogger(__name__)

INDEX_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "local_index.json"
)

@lru_cache(maxsize=8)
def get_investigation_graph(
    provider: str = "ollama",
    model: str = "qwen3:4b",
):
    index = LocalVectorIndex.load(INDEX_PATH)

    retreiver = RepositoryRetriever(
        index=index,
        embeddings=OllamaEmbeddingProvider()
    )

    selection = LLMSelection(
        provider=provider,
        model=model,
    )

    anylze = LLMProviderFactory(selection).create_text_provider()

    graph = build_investigation_graph(
        retriever=retreiver,
        analyst=anylze
    )

    return graph


def get_investigation_store() -> InvestigationStore:
    store = InvestigationStore()
    store.initialize()
    return store


@router.post("/investigate", response_model=SavedInvestigation)
def investigate(
    request: InvestigationRequest,
    store: InvestigationStore = Depends(get_investigation_store)
) -> SavedInvestigation:
    settings = get_settings()
    selection = LLMSelectionStore().get(
            fallback=settings.llm_selection
        )

    # Local development endpoint only.
    if settings.environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local agent API is disabled",
        )

    #for demo parts
    if request.repository_id != "demo-repository":
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    if not INDEX_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail="Repository index is unavailable",
        )

    try:
        graph = get_investigation_graph(
            provider=selection.provider.value,
            model=selection.model,
        )

        result = graph.invoke(
            {
                "repository_id": request.repository_id,
                "question": request.question,
                "plan": "",
                "answer": "",
                "evidence": [],
                "attempts": 0,
                "max_attempts": 3,
                "review_feedback": "",
                "review_passed": False
            }
        )

    except httpx.TimeoutException:
        logger.exception("Investigation timed out while contacting the local AI service")
        raise HTTPException(
            status_code=504,
            detail="Local AI service timed out",
        ) from None
    except httpx.HTTPError:
        logger.exception("Investigation failed during a local AI service request")
        raise HTTPException(
            status_code=503,
            detail="Local AI service is unavailable",
        ) from None
    except (OSError, ValueError, KeyError):
        logger.exception("Investigation failed")
        raise HTTPException(
            status_code=503,
            detail="Investigation could not be completed",
        ) from None


    investigation_result =  InvestigationResponse(
        repository_id=request.repository_id,
        question=request.question,
        plan=result["plan"],
        answer=result["answer"],
        review_passed=result["review_passed"],
        review_feedback=result["review_feedback"],
        attempts=result["attempts"],
        sources=[
            InvestigationSource(
                source_id= item["source_id"],
                chunk_id=item["chunk_id"],
                file_path=item["file_path"],
                start_line=item["start_line"],
                end_line=item["end_line"],
                commit_sha=item["commit_sha"],
            )
            for item in result["evidence"]
        ]
    )

    saved = store.save(investigation_result)

    return SavedInvestigation.model_validate(saved)

@router.get("/investigations", response_model=list[InvestigationSummary])
def list_investigations(
    store: InvestigationStore = Depends(get_investigation_store)
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
