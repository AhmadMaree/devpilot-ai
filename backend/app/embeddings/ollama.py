
import httpx

class OllamaEmbeddingProvider:

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "nomic-embed-text"
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model


    def embed_text(
        self,
        texts: list[str]
    ) -> list[list[float]]:

        if not texts:
            return []

        response = httpx.post(
            f"{self.base_url}/api/embed",
            json={
                "model": self.model,
                "inputs": texts
            },
            timeout=120.0
        )

        response.raise_for_status()

        data = response.json()
        embeddings = data["embeddings"]

        if len(embeddings) != len(texts):
            raise ValueError(
                "Embedding count doesn't match input count"
            )

        if not embeddings or not embeddings[0]:
            raise ValueError("Embedding model returned empty vectors")

        dimension = len(embeddings[0])

        if any(
            len(vector) != dimension
            for vector in embeddings
        ):
            raise ValueError("Embedding dimensions are inconsistent")
        
        return embeddings
        