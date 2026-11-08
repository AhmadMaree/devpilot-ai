from functools import lru_cache
from openai import AzureOpenAI

from app.core import get_settings

@lru_cache(maxsize=1)
def get_azure_openai_client() -> AzureOpenAI:
    settings = get_settings()

    endpoint = settings.azure_openai_endpoint.strip().rstrip("/")
    api_key = settings.azure_openai_api_key.get_secret_value()

    if not endpoint or not api_key:
        raise ValueError(
            "AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY "
            "must be configured"
        )

    return AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=settings.azure_openai_api_version,
        timeout=120.0,
        max_retries=2
    )

