from uuid import UUID

from app.repositories.index_paths import get_repository_index_path
from app.repositories.index_store import RepositoryIndexStore
from app.retrieval.local_index import LocalVectorIndex


class RepositoryIndexNotFoundError(FileNotFoundError):
    pass


def load_repository_index(repository_id: UUID) -> LocalVectorIndex:
    metadata = RepositoryIndexStore().get(repository_id)
    index_path = get_repository_index_path(
        repository_id,
        metadata.index_version if metadata is not None else None,
    )

    if not index_path.is_file():
        raise RepositoryIndexNotFoundError(
            f"Repository {repository_id} has not been indexed"
        )

    index = LocalVectorIndex.load(index_path)

    # Fail closed if the stored index contains another
    # repository's source chunks.
    if any(item.chunk.repository_id != str(repository_id) for item in index.items):
        raise ValueError("Index contains chunks from another repository")

    return index
