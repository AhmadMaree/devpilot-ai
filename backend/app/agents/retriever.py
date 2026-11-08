from app.embeddings.ollama import OllamaEmbeddingProvider
from app.retrieval.local_index import SearchResult
from app.retrieval.search import RepositorySearch


class RepositoryRetriever:
    def __init__(
        self,
        index: RepositorySearch,
        embeddings: OllamaEmbeddingProvider,
        index_version: str,
    ):
        self.index = index
        self.embeddings = embeddings
        self.index_version = index_version

    def search(
        self,
        question: str,
        repository_id: str,
        limit: int,
    ) -> list[SearchResult]:

        vector = self.embeddings.embed_texts([question])

        if len(vector) != 1 or not vector[0]:
            raise ValueError("Invalid query embedding")

        results = self.index.search(
            query_text=question,
            query_vector=vector[0],
            limit=limit,
            repository_id=repository_id,
            index_version=self.index_version,
        )

        selected = []

        # reduce CPU inference time and context-window pressure
        remaining_char = 6000

        for res in results:
            if len(res.chunk.content) <= remaining_char:
                selected.append(res)
                remaining_char -= len(res.chunk.content)

        return selected
