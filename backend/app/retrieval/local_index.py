import json
from pathlib import Path

from pydantic import BaseModel
from app.chunking.models import SourceChunk
from app.utils import cosine_similarity


class IndexChunks(BaseModel):
    chunk: SourceChunk
    embedding: list[float]


class SearchResult(BaseModel):
    chunk: SourceChunk
    score: float


class LocalVectorIndex:
    def __init__(self):
        self.items: list[IndexChunks] = []

    def add(self, chunks: list[SourceChunk], embeddings: list[list[float]]) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("Chunk and embedding counts differ")

        if embeddings:
            dimension = len(embeddings[0])

            if dimension == 0:
                raise ValueError("Empty Embeddings")

            if any(len(vector) != dimension for vector in embeddings):
                raise ValueError("Inconsistent vector dimensions")

            if self.items and len(self.items[0].embedding) != dimension:
                raise ValueError("Index embedding dimension mismatch")

        self.items.extend(
            IndexChunks(chunk=chunk, embedding=embedding)
            for chunk, embedding in zip(chunks, embeddings)
        )

    def serach(
        self, query_search: list[float], limit: int = 5, repo_id: str | None = None
    ) -> list[SearchResult]:

        if limit <= 0:
            return []

        results = [
            SearchResult(
                chunk=item.chunk,
                score=cosine_similarity(first=query_search, sec=item.embedding),
            )
            for item in self.items
            if repo_id is None or item.chunk.repository_id == repo_id
        ]

        return sorted(results, key=lambda x: x.score, reverse=True)[:limit]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)

        payload = {"items": [item.model_dump() for item in self.items]}

        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "LocalVectorIndex":

        data = json.loads(path.read_text(encoding="utf-8"))

        index = cls()

        index.items = [IndexChunks.model_validate(item) for item in data["items"]]

        return index
