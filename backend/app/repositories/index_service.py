import os
from uuid import UUID

from app.repositories.index_paths import (
    get_repository_index_path,
)
from app.repositories.postgres_index_store import (
    PostgresRepositoryIndexStore,
)
from app.retrieval.local_index import LocalVectorIndex
from app.storage.azure_blob import AzureBlobIndexStore


class RepositoryIndexNotFoundError(FileNotFoundError):
    pass


def blob_storage_enabled() -> bool:
    return os.getenv("AZURE_BLOB_ENABLED", "false").strip().lower() == "true"


def load_repository_index(
    repository_id: UUID,
) -> LocalVectorIndex:
    metadata = PostgresRepositoryIndexStore().get(repository_id)

    if metadata is None or not metadata.index_version:
        raise RepositoryIndexNotFoundError(
            f"Repository {repository_id} has no active index"
        )

    index_path = get_repository_index_path(
        repository_id,
        metadata.index_version,
    )

    if not index_path.is_file():
        if not blob_storage_enabled():
            raise RepositoryIndexNotFoundError(
                f"Local index for repository {repository_id} "
                "is unavailable and Azure Blob Storage "
                "is disabled."
            )

        blob_store = AzureBlobIndexStore()

        try:
            blob_store.download_index(
                repository_id=repository_id,
                index_version=metadata.index_version,
                destination=index_path,
            )
        except Exception as exc:
            raise RepositoryIndexNotFoundError(
                f"Could not restore the active index for repository {repository_id}"
            ) from exc

    index = LocalVectorIndex.load(index_path)

    # Preserve the repository isolation check.
    if any(item.chunk.repository_id != str(repository_id) for item in index.items):
        raise ValueError("Index contains chunks from another repository")

    return index
