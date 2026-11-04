
from uuid import UUID

from app.repositories.index_paths import get_repository_index_path
from app.retrieval.local_index import LocalVectorIndex


class RepositoryIndexNotFoundError(FileNotFoundError):
    pass


def load_repository_index(repository_id: UUID) -> LocalVectorIndex:
    index_path = get_repository_index_path(repository_id)

    if not index_path.is_file():
        raise RepositoryIndexNotFoundError(
            f"Repository {repository_id} has not been indexed"
        )

    index = LocalVectorIndex.load(index_path)

    # Fail closed if the stored index contains another
    # repository's source chunks.
    if any(
        item.chunk.repository_id != str(repository_id)
        for item in index.items
    ):
        raise ValueError(
            "Index contains chunks from another repository"
        )

    return index
