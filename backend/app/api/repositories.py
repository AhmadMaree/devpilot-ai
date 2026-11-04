import sqlite3
import httpx
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core import get_settings
from app.repositories.models import (
    RegisterRepositoryRequest,
    Repository,
)
from app.repositories.store import RepositoryStore
from app.repositories.validation import (
    InvalidRepositoryError,
    validate_repository_path,
)

from app.repositories.indexer import (
    RepositoryNotFoundError,
    index_repository,
)
from app.repositories.index_store import RepositoryIndexStore
from app.embeddings.ollama import OllamaEmbeddingProvider



router = APIRouter(
    prefix="/api/v1/repositories",
    tags=["Repositories"],
)

def require_local_environment() -> None:
    settings = get_settings()

    if settings.environment != "development":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local repository management is disabled",
        )


def get_repository_store() -> RepositoryStore:
    store = RepositoryStore()
    store.initialize()
    return store

@router.post(
    "",
    response_model=Repository,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_local_environment)]
)
def register_repository(
    request: RegisterRepositoryRequest,
    store: RepositoryStore = Depends(get_repository_store)
) -> Repository:
    try:
        repository_path = validate_repository_path(request.path)
    except InvalidRepositoryError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    try:
        return store.create(
            name=request.name.strip(),
            path=repository_path,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="This repository is already registered",
        ) from None

@router.get(
    "",
    response_model=list[Repository],
    dependencies=[Depends(require_local_environment)],
)
def list_repositories(
    store: RepositoryStore = Depends(get_repository_store),
) -> list[Repository]:
    return store.list_all()


@router.get(
    "/{repository_id}",
    response_model=Repository,
    dependencies=[Depends(require_local_environment)],
)

def get_repository(
    repository_id: UUID,
    store: RepositoryStore = Depends(get_repository_store),
) -> Repository:
    repository = store.get(repository_id)
    if repository is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    return repository

@router.delete(
    "/{repository_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_local_environment)],
)
def unregister_repository(
    repository_id: UUID,
    store: RepositoryStore = Depends(get_repository_store),
) -> None:
    deleted = store.delete(repository_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )


@router.post(
    "/{repository_id}/index",
    dependencies=[Depends(require_local_environment)],
)
def index_registered_repository(
    repository_id: UUID,
    store: RepositoryStore = Depends(get_repository_store),
):
    try:
        return index_repository(
            repository_id=repository_id,
            repository_store=store,
            index_store=RepositoryIndexStore(
                db_path=store.db_path
            ),
            embeddings=OllamaEmbeddingProvider(),
        )

    except RepositoryNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        ) from None

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Embedding service timed out",
        ) from None

    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Embedding service is unavailable",
        ) from None

    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc