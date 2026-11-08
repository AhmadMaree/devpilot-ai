import logging
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from threading import Event
from uuid import UUID, uuid4

from app.chunking.services import chunk_documents
from app.embeddings.base import EmbeddingProvider
from app.ingestion.service import ingest_repository
from app.repositories.index_jobs import IndexingCancelledError
from app.repositories.index_paths import get_repository_index_path
from app.repositories.index_store import RepositoryIndexStore
from app.repositories.store import RepositoryStore
from app.retrieval.azure_index import AzureSearchIndex
from app.retrieval.local_index import LocalVectorIndex
from app.embeddings.factory import get_embedding_model_identity

IndexProgress = Callable[[str, int, int], None]
logger = logging.getLogger(__name__)


class RepositoryNotFoundError(ValueError):
    pass


class NoIndexableFilesError(ValueError):
    pass


def index_repository(
    repository_id: UUID,
    repository_store: RepositoryStore,
    index_store: RepositoryIndexStore,
    embeddings: EmbeddingProvider,
    progress: IndexProgress | None = None,
    job_id: UUID | None = None,
    cancel_event: Event | None = None,
    azure_index: AzureSearchIndex | None = None,
) -> dict:
    def check_cancelled() -> None:
        if cancel_event is not None and cancel_event.is_set():
            raise IndexingCancelledError("Repository indexing was cancelled")

    check_cancelled()
    repository = repository_store.get(repository_id)

    if repository is None:
        raise RepositoryNotFoundError("Repository not found")

    # Existing ingestion validates the repository and
    # rejects uncommitted changes.
    if progress is not None:
        progress("ingestion", 0, 0)

    ingestion = ingest_repository(
        repo_id=str(repository_id),
        repo_path=Path(repository.path),
    )
    check_cancelled()

    if progress is not None:
        progress("chunking", 0, 0)

    chunks = chunk_documents(ingestion.documents)
    check_cancelled()

    if not chunks:
        raise NoIndexableFilesError("No supported source files were found")

    index = LocalVectorIndex()
    index_version = str(job_id or uuid4())
    embedding_model = get_embedding_model_identity()

    # Batch embeddings to avoid sending a large repository
    # to Ollama in a single HTTP request.
    batch_size = 16
    azure_embeddings: list[list[float]] = []

    if progress is not None:
        progress("embedding", 0, len(chunks))

    for start in range(0, len(chunks), batch_size):
        check_cancelled()
        batch = chunks[start : start + batch_size]

        vectors = embeddings.embed_texts([chunk.content for chunk in batch])

        index.add(batch, vectors)

        if azure_index is not None:
            azure_embeddings.extend(vectors)

        if progress is not None:
            progress("embedding", start + len(batch), len(chunks))

    check_cancelled()
    index_path = get_repository_index_path(repository_id, index_version)
    index_path.parent.mkdir(parents=True, exist_ok=True)

    if progress is not None:
        progress("saving", len(chunks), len(chunks))

    # Write the complete index to a temporary file first.
    # Do not overwrite the previous index on embedding failure.
    temp_path = None
    activated = False

    try:
        check_cancelled()

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json",
            prefix=".index-",
            dir=index_path.parent,
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)

        index.save(temp_path)
        check_cancelled()

        os.replace(temp_path, index_path)
        temp_path = None

        check_cancelled()
        if azure_index is not None:
            if progress is not None:
                progress("uploading", 0, len(chunks))

            azure_index.add(
                chunks=chunks,
                embeddings=azure_embeddings,
                index_version=index_version,
            )

            check_cancelled()

            if progress is not None:
                progress("uploading", len(chunks), len(chunks))

        azure_ready = azure_index is not None

        if job_id is None:
            index_store.save(
                repository_id=repository_id,
                commit_sha=ingestion.commit_sha,
                index_version=index_version,
                azure_ready=azure_ready,
                embedding_model=embedding_model,
            )
        else:
            index_store.activate_for_job(
                repository_id=repository_id,
                commit_sha=ingestion.commit_sha,
                index_version=index_version,
                job_id=job_id,
                total_chunks=len(chunks),
                azure_ready=azure_ready,
                embedding_model=embedding_model,
            )
        activated = True
    except Exception:
        try:
            metadata = index_store.get(repository_id)
            is_active = metadata is not None and metadata.index_version == index_version
        except Exception:  # noqa: BLE001
            logger.warning(
                "Could not verify active repository index after indexing failure; "
                "preserving index data."
            )
            is_active = True  # Fail safely: preserve data.

        if not activated and not is_active:
            # Remove the incomplete local index.
            try:
                index_path.unlink(missing_ok=True)
            except OSError:
                pass

            # Remove documents from this failed Azure version.
            if azure_index is not None:
                try:
                    azure_index.delete_version(
                        repository_id=str(repository_id),
                        index_version=index_version,
                    )
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Could not clean up failed Azure index version %s.",
                        index_version,
                    )
        raise
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

    return {
        "repository_id": str(repository_id),
        "commit_sha": ingestion.commit_sha,
        "indexed_files": ingestion.indexed_files,
        "skipped_files": ingestion.skipped_files,
        "indexed_chunks": len(chunks),
        "index_path": str(index_path),
    }
