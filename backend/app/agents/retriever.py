
from app.retrieval.local_index import LocalVectorIndex
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.retrieval.local_index import SearchResult

class RepositoryRetriever:

    def __init__(
        self,
        index: LocalVectorIndex,
        embeddings: OllamaEmbeddingProvider
    ):
        self.index = index
        self.embeddings=embeddings

    def search(
        self,
        question: str,
        repository_id: str,
        limit: int,
    ) -> list[SearchResult]:

        vector = self.embeddings.embed_texts([question])

        if len(vector) != 1  or not vector[0]:
            raise ValueError("Invalid query embedding")

        results = self.index.serach(
            query_search=vector[0],
            limit=limit,
            repo_id=repository_id
        )

        selected = []

        #reduce CPU inference time and context-window pressure
        remaining_char = 6000

        for res in results:
            if len(res.chunk.content) <= remaining_char:
                selected.append(res)
                remaining_char -= len(res.chunk.content)

        return selected

        