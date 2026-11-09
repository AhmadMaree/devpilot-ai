
import os
from uuid import UUID

from app.embeddings.factory import get_embedding_model_identity
from app.repositories.index_service import (
    RepositoryIndexNotFoundError,
    load_repository_index,
)
from app.repositories.postgres_index_store import (
    PostgresRepositoryIndexStore,
)
from app.retrieval.azure_index import AzureSearchIndex
from app.retrieval.search import (
    LocalRepositorySearch,
    RepositorySearch,
)


def get_retrieval_backend() -> str:
    backend = os.getenv(
        "RETRIEVAL_BACKEND",
        "local",
    ).strip().lower()

    if backend not in {"local", "azure"}:
        raise ValueError(
            "RETRIEVAL_BACKEND must be 'local' or 'azure'"
        )

    return backend


def get_active_index_version(
    repository_id: UUID,
    backend: str = "local",
) -> str:
    metadata = PostgresRepositoryIndexStore().get(
        repository_id
    )

    if metadata is None or not metadata.index_version:
        raise RepositoryIndexNotFoundError(
            f"Repository {repository_id} has no active index"
        )

    expected_embedding_model = (
        get_embedding_model_identity()
    )

    if metadata.embedding_model != expected_embedding_model:
        raise RepositoryIndexNotFoundError(
            "The active repository index was generated using "
            "a different or unknown embedding model. "
            "Reindex the repository with the currently "
            "configured embedding provider."
        )

    if backend == "azure" and not metadata.azure_ready:
        raise RepositoryIndexNotFoundError(
            "The active repository index is not available "
            "in Azure. Reindex the repository with "
            "Azure indexing enabled."
        )

    return metadata.index_version


def create_repository_search(
    repository_id: UUID,
    backend: str,
) -> RepositorySearch:
    if backend == "azure":
        return AzureSearchIndex()

    if backend == "local":
        return LocalRepositorySearch(
            load_repository_index(repository_id)
        )

    raise ValueError(
        f"Unsupported retrieval backend: {backend}"
    )
