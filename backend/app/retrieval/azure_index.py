import base64
import os

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery
from dotenv import load_dotenv

from app.chunking.models import SourceChunk
from app.retrieval.local_index import SearchResult

from .azure_schema import INDEX_NAME, VECTOR_DIMENSIONS


class AzureSearchIndex:
    def __init__(
        self,
        client: SearchClient | None = None,
    ) -> None:
        if client is not None:
            self.client = client
            return

        load_dotenv()

        endpoint = os.getenv("AZURE_SEARCH_ENDPOINT", "").strip()
        admin_key = os.getenv("AZURE_SEARCH_ADMIN_KEY", "").strip()
        index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", INDEX_NAME)

        if not endpoint or not admin_key:
            raise ValueError("Azure AI Search configuration is missing")

        self.client = SearchClient(
            endpoint=endpoint,
            index_name=index_name,
            credential=AzureKeyCredential(admin_key),
        )

    @staticmethod
    def _document_id(chunck_id: str) -> str:
        return (
            base64.urlsafe_b64encode(chunck_id.encode("utf-8"))
            .decode("ascii")
            .rstrip("=")
        )

    @staticmethod
    def _validate_vector(vector: list[float]) -> None:
        if len(vector) != VECTOR_DIMENSIONS:
            raise ValueError(
                f"Expected {VECTOR_DIMENSIONS} dimensions, got {len(vector)}"
            )

    def add(
        self,
        chunks: list[SourceChunk],
        embeddings: list[list[float]],
        index_version: str,
    ) -> None:
        if not index_version:
            raise ValueError("index_version is required")

        if len(chunks) != len(embeddings):
            raise ValueError("Chunk and embedding counts differ")

        if not chunks:
            return

        documents = []

        for chunk, embedding in zip(chunks, embeddings):
            self._validate_vector(embedding)

            documents.append(
                {
                    "id": self._document_id(
                        f"{chunk.repository_id}:{index_version}:{chunk.chunk_id}"
                    ),
                    "repository_id": chunk.repository_id,
                    "chunk_id": chunk.chunk_id,
                    "commit_sha": chunk.commit_sha,
                    "file_path": chunk.file_path,
                    "language": chunk.language,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "content": chunk.content,
                    "content_sha256": chunk.content_sha256,
                    "content_vector": embedding,
                    "index_version": index_version,
                }
            )

        batch_size = 16
        for start in range(0, len(documents), batch_size):
            batch = documents[start : start + batch_size]

            results = self.client.upload_documents(documents=batch)

            failed = [result.key for result in results if not result.succeeded]

            if failed:
                raise RuntimeError(f"Azure Search upload failed for: {failed}")

    def search(
        self,
        query_text: str,
        query_vector: list[float],
        repository_id: str,
        limit: int = 5,
        index_version: str | None = None,
    ) -> list[SearchResult]:
        if not repository_id:
            raise ValueError("repository_id is required")

        if not index_version:
            raise ValueError("Azure search requires an active index_version")

        if limit <= 0:
            return []

        self._validate_vector(query_vector)

        safe_repo_id = repository_id.replace("'", "''")
        safe_version = index_version.replace("'", "''")

        search_filter = (
            f"repository_id eq '{safe_repo_id}' and index_version eq '{safe_version}'"
        )

        results = self.client.search(
            search_text=query_text,
            vector_queries=[
                VectorizedQuery(
                    vector=query_vector,
                    k_nearest_neighbors=limit,
                    fields="content_vector",
                )
            ],
            filter=search_filter,
            select=[
                "id",
                "repository_id",
                "chunk_id",
                "commit_sha",
                "file_path",
                "language",
                "start_line",
                "end_line",
                "content",
                "content_sha256",
            ],
            top=limit,
        )

        matches = []

        for result in results:
            chunk = SourceChunk(
                chunk_id=result["chunk_id"],
                repository_id=result["repository_id"],
                commit_sha=result["commit_sha"],
                file_path=result["file_path"],
                language=result["language"],
                start_line=result["start_line"],
                end_line=result["end_line"],
                content=result["content"],
                content_sha256=result["content_sha256"],
            )

            matches.append(
                SearchResult(
                    chunk=chunk,
                    score=float(result["@search.score"]),
                )
            )

        return matches

    # cleanup version faild
    def delete_version(
        self,
        repository_id: str,
        index_version: str,
    ) -> None:
        if not repository_id or not index_version:
            raise ValueError("repository_id and index_version are required")

        safe_repo_id = repository_id.replace("'", "''")
        safe_version = index_version.replace("'", "''")

        search_filter = (
            f"repository_id eq '{safe_repo_id}' and index_version eq '{safe_version}'"
        )

        # Iterate over all results instead of limiting cleanup
        # to the first 1,000 documents.
        results = self.client.search(
            search_text="*",
            filter=search_filter,
            select=["id"],
        )

        batch: list[dict[str, str]] = []

        def delete_batch(documents: list[dict[str, str]]) -> None:
            responses = self.client.delete_documents(documents=documents)

            failed = [response.key for response in responses if not response.succeeded]

            if failed:
                raise RuntimeError(f"Azure document deletion failed: {failed}")

        for result in results:
            batch.append({"id": result["id"]})

            if len(batch) == 100:
                delete_batch(batch)
                batch = []

        if batch:
            delete_batch(batch)
