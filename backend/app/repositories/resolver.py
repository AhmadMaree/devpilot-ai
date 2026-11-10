from typing import Protocol
from uuid import UUID

from fastapi import HTTPException

from app.repositories.models import Repository


class RepositoryReader(Protocol):
    def get(self, repository_id: UUID) -> Repository | None: ...


def resolve_registered_repository(
    repository_id: str | UUID,
    store: RepositoryReader,
) -> Repository:
    try:
        parsed_id = UUID(str(repository_id))
    except (ValueError, TypeError, AttributeError):
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
