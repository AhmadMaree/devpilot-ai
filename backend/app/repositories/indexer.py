
import os
import tempfile
from pathlib import Path
from uuid import UUID

from app.chunking.services import chunk_documents
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.ingestion.service import ingest_repository
from app.repositories.index_paths import get_repository_index_path
from app.repositories.index_store import RepositoryIndexStore
from app.repositories.store import RepositoryStore
from app.retrieval.local_index import LocalVectorIndex


class RepositoryNotFoundError(ValueError):
    pass


def index_repository(
    repository_id: UUID,
    repository_store: RepositoryStore,
    index_store: RepositoryIndexStore,
    embeddings: OllamaEmbeddingProvider,
) -> dict:
    repository = repository_store.get(repository_id)

    if repository is None:
        raise RepositoryNotFoundError(
            "Repository not found"
        )

    # Existing ingestion validates the repository and
    # rejects uncommitted changes.
    ingestion = ingest_repository(
        repo_id=str(repository_id),
        repo_path=Path(repository.path),
    )

    chunks = chunk_documents(ingestion.documents)

    if not chunks:
        raise ValueError(
            "No supported source code chunks were found"
        )

    index = LocalVectorIndex()

    # Batch embeddings to avoid sending a large repository
    # to Ollama in a single HTTP request.
    batch_size = 16

    for start in range(0, len(chunks), batch_size):
        batch = chunks[start:start + batch_size]

        vectors = embeddings.embed_texts(
            [chunk.content for chunk in batch]
        )

        index.add(batch, vectors)

    index_path = get_repository_index_path(repository_id)
    index_path.parent.mkdir(parents=True, exist_ok=True)

    # Write the complete index to a temporary file first.
    # Do not overwrite the previous index on embedding failure.
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json",
            prefix=".index-",
            dir=index_path.parent,
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)

        index.save(temp_path)

        # Replace only after serialization succeeds.
        os.replace(temp_path, index_path)
        temp_path = None

        index_store.save(
            repository_id=repository_id,
            commit_sha=ingestion.commit_sha,
        )
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
