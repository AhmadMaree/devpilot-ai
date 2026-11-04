
from pathlib import Path
from uuid import UUID

from app.repositories.index_paths import (
    get_repository_index_path,
)
from app.retrieval.local_index import LocalVectorIndex

class RepositoryIndexNotFoundError(FileNotFoundError):
    pass


def load_repository_index(
    repository_id: UUID,
) -> LocalVectorIndex:
    index_path: Path = get_repository_index_path(repository_id)

    if not index_path.is_file():
        raise RepositoryIndexNotFoundError(
            f"No index exists for repository {repository_id}"
        )

    return LocalVectorIndex.load(index_path)