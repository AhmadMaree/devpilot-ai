from pathlib import Path
from app.core import get_settings
from app.ingestion.service import ingest_repository
from app.chunking.services import chunk_documents
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.retrieval.local_index import LocalVectorIndex

def main():

    settings = get_settings()

    if settings.environment != "development":
        raise RuntimeError("Local indexing requires development mode")

    if not settings.demo_repository_path:
        raise RuntimeError("DEMO_REPOSITORY_PATH is not configured")

    repo_path = Path(settings.demo_repository_path)

    result = ingest_repository(
        repo_path=repo_path,
        repo_id="demo-repository"
    )

    print(f" Documents: {result.indexed_files}")
    print(f"Skipped Files count : {result.skipped_files}")

    chunks = chunk_documents(
        documents=result.documents,
        max_lines=40,
        overlap_lines=5
    )

    print(f" Chunks : {len(chunks)}")

    provider = OllamaEmbeddingProvider()
    index = LocalVectorIndex()

    batch_size = 8

    for start in range(0, len(chunks), batch_size):
        batch = chunks[start: start + batch_size]

        texts = [
            (
                f" File: {chunk.file_path}\n"
                f"language: {chunk.language}\n"
                f"Code : {chunk.content}"
            )
            for chunk in batch
        ]

        embeddings = provider.embed_text(texts)
        index.add(batch, embeddings)

        print(
            f"Embedded {min(start + batch_size, len(chunks))}"
            f"/{len(chunks)} chunks"
        )


    output_path = Path("data/local_index.json")
    index.save(output_path)

    print(f"4. Saved index to: {output_path}")
    print("Indexing completed.")


if __name__ == "__main__":
    main()

