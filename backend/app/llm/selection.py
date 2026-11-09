from app.core import get_settings
from app.llm.models import LLMProviderType, LLMSelection
from app.llm.postgres_store import PostgresLLMSelectionStore


def get_effective_llm_selection() -> LLMSelection:
    settings = get_settings()

    if settings.environment == "production": 
        selection = settings.llm_selection

        if selection.provider != LLMProviderType.OPENAI:
            raise ValueError(
                "Production requires the configured "
                "Azure OpenAI provider"
            )

        if selection.model != settings.azure_openai_chat_deployment:
            raise ValueError(
                "Production LLM_MODEL must match "
                "AZURE_OPENAI_CHAT_DEPLOYMENT"
            )

        return selection

    # Development retains the existing UI-selected model.
    return PostgresLLMSelectionStore().get(
        fallback=settings.llm_selection
    )