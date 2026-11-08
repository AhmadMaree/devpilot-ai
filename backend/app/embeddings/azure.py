from app.core import get_settings
from app.llm.azure_client import get_azure_openai_client


class AzureEmbeddingProvider:
    def __init__(
        self
    ):
        settings = get_settings()

        self.client =  get_azure_openai_client()
        self.model = settings.azure_openai_embedding_deployment
        self.dimensions = settings.azure_embedding_dimensions

        if self.dimensions != 768:
            raise ValueError(
                "The current Azure AI Search index requires "
                "768-dimensional vectors"
            )

    def embed_texts(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        if not texts:
            return []

        if any(not text.strip() for text in texts):
            raise ValueError("Cannot embed empty text")

        # Keep requests small for development repositories.
        batch_size = 16
        vectors: list[list[float]] = []

        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]

            response = self.client.embeddings.create(
                input=batch,
                model= self.model,
                dimensions= self.dimensions,
                encoding_format="float"
            )

            ordered = sorted(
                response.data,
                key= lambda x: x.index
            )

            if len(ordered) != len(batch):
                raise ValueError(
                    "Azure embedding response count mismatch"
                )

            for expected_index, item in enumerate(ordered):
                if item.index != expected_index:
                    raise ValueError(
                        "Azure embedding response indices mismatch"
                    )

                vector = item.embedding

                if len(vector) != self.dimensions:
                    raise ValueError(
                        "Azure returned unexpected vector dimensions"
                    )

                vectors.append(vector)

        return vectors