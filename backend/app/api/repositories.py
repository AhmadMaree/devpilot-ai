import sqlite3
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core import get_settings
from app.repositories.github_import import (
    GitHubImportError,
    import_public_github_repository,
)
from app.repositories.index_job_manager import RepositoryIndexJobManager
from app.repositories.index_jobs import (
    DuplicateIndexJobError,
    IndexingJob,
    IndexJobQueueFullError,
)
from app.repositories.index_store import (
    RepositoryIndexMetadata,
    RepositoryIndexStore,
)
from app.repositories.models import (
    ImportGitHubRepositoryRequest,
    RegisterRepositoryRequest,
    Repository,
)
from app.repositories.store import RepositoryStore
from app.repositories.validation import (
    InvalidRepositoryError,
    validate_repository_path,
)

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


def get_index_job_manager(request: Request) -> RepositoryIndexJobManager:
    return request.app.state.index_job_manager


@router.post(
    "",
    response_model=Repository,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_local_environment)],
)
def register_repository(
    request: RegisterRepositoryRequest,
    store: RepositoryStore = Depends(get_repository_store),
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
    response_model=IndexingJob,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_local_environment)],
)
def index_registered_repository(
    repository_id: UUID,
    store: RepositoryStore = Depends(get_repository_store),
    manager: RepositoryIndexJobManager = Depends(get_index_job_manager),
):
    if store.get(repository_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    try:
        return manager.enqueue(repository_id)
    except DuplicateIndexJobError:
        raise HTTPException(
            status_code=409,
            detail="Repository indexing is already queued or running",
        ) from None
    except IndexJobQueueFullError:
        raise HTTPException(
            status_code=503,
            detail="Repository indexing queue is full",
        ) from None


@router.get(
    "/{repository_id}/index/status",
    response_model=IndexingJob,
    dependencies=[Depends(require_local_environment)],
)
def get_repository_index_status(
    repository_id: UUID,
    store: RepositoryStore = Depends(get_repository_store),
    manager: RepositoryIndexJobManager = Depends(get_index_job_manager),
):
    if store.get(repository_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    job = manager.latest(repository_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail="No indexing job found",
        )
    return job


@router.get(
    "/{repository_id}/index",
    response_model=RepositoryIndexMetadata,
    dependencies=[Depends(require_local_environment)],
)
def get_repository_index_metadata(
    repository_id: UUID,
    store: RepositoryStore = Depends(get_repository_store),
):
    if store.get(repository_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    metadata = RepositoryIndexStore(db_path=store.db_path).get(repository_id)
    if metadata is None:
        raise HTTPException(
            status_code=404,
            detail="Repository has not been indexed",
        )
    return metadata


@router.post(
    "/import/github",
    response_model=Repository,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_local_environment)],
)
def import_github_repository(
    request: ImportGitHubRepositoryRequest,
    store: RepositoryStore = Depends(get_repository_store),
) -> Repository:
    try:
        return import_public_github_repository(url=request.url, store=store)
    except GitHubImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Repository is already registered",
        ) from None
