from typing import Protocol

from app.retrieval.local_index import LocalVectorIndex, SearchResult


class RepositorySearch(Protocol):
    def search(
        self,
        query_text: str,
        query_vector: list[float],
        repository_id: str,
        limit: int = 5,
        index_version: str | None = None,
    ) -> list[SearchResult]: ...


class LocalRepositorySearch:
    def __init__(self, index: LocalVectorIndex) -> None:
        self.index = index

    def search(
        self,
        query_text: str,
        query_vector: list[float],
        repository_id: str,
        limit: int = 5,
        index_version: str | None = None,
    ) -> list[SearchResult]:

        return self.index.serach(
            query_search=query_vector,
            repo_id=repository_id,
            limit=limit,
        )
