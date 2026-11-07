from uuid import UUID

from fastapi import HTTPException

from app.repositories.store import RepositoryStore


def resolve_registered_repository(
    repository_id: str,
    store: RepositoryStore,
):
    try:
        parsed_id = UUID(repository_id)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Invalid repository UUID",
        ) from None

    repository = store.get(parsed_id)

    if repository is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    return repository
