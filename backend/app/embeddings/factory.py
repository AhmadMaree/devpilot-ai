from app.core import get_settings
from app.embeddings.azure import AzureEmbeddingProvider
from app.embeddings.base import EmbeddingProvider
from app.embeddings.ollama import OllamaEmbeddingProvider


def get_embedding_provider_name() -> str:
    provider = get_settings().embedding_provider.strip().lower()

    if provider not in {"ollama", "azure"}:
        raise ValueError("EMBEDDING_PROVIDER must be 'ollama' or 'azure'")
    return provider


def create_embedding_provider() -> EmbeddingProvider:
    provider = get_embedding_provider_name()

    if provider == "azure":
        return AzureEmbeddingProvider()
    return OllamaEmbeddingProvider()


def get_embedding_model_identity() -> str:
    settings = get_settings()
    provider = get_embedding_provider_name()

    if provider == "azure":
        return (
            f"azure:{settings.azure_openai_endpoint.rstrip('/').lower()}"
            f":{settings.azure_openai_embedding_deployment}"
            f":{settings.azure_embedding_dimensions}"
        )

    return f"ollama:{settings.ollama_embedding_model}"
