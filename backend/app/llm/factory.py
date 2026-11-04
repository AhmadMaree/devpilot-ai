from dataclasses import dataclass

from app.llm.models import LLMProviderType, LLMSelection
from app.rag.ollama import OllamaChatProvider
from app.patches.ollama_provider import OllamaPatchProvider
from app.llm.gemini_provider import GeminiProvider, GeminiPatchProvider


class ProviderNotConfiguredError(ValueError):
    """Raised when a selected provider is unavailable."""


@dataclass
class LLMProviderFactory:
    selection: LLMSelection

    def create_text_provider(self):
        if self.selection.provider.lower() == LLMProviderType.OLLAMA:
            return OllamaChatProvider(
                model=self.selection.model
            )
        if self.selection.provider == LLMProviderType.GEMINI:
            return GeminiProvider(model=self.selection.model)

        raise ProviderNotConfiguredError(
            f"Text generation provider "
            f"'{self.selection.provider.value}' is not configured"
        )

    def create_patch_provider(self):
        if self.selection.provider == LLMProviderType.OLLAMA:
            return OllamaPatchProvider(
                model=self.selection.model
            )

        if self.selection.provider == LLMProviderType.GEMINI:
            return GeminiPatchProvider(
                model=self.selection.model
            )

        raise ProviderNotConfiguredError(
            f"Patch generation provider "
            f"'{self.selection.provider.value}' is not configured"
        )
