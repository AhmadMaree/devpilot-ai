from enum import Enum

from pydantic import BaseModel, Field


class LLMProviderType(str, Enum):
    OLLAMA = "ollama"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"


class LLMSelection(BaseModel):
    provider: LLMProviderType = LLMProviderType.OLLAMA
    model: str = Field(
        default="qwen3:4b",
        min_length=1,
        max_length=200,
    )
