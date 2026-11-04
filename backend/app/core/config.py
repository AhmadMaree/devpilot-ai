from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.llm.models import LLMSelection


class Settings(BaseSettings):
    app_name: str = "DevPilot AI"
    app_version: str = "0.1.0"
    environment: str = "development"
    frontend_origin: str = "http://localhost:5173"
    demo_repository_path: str = ""

    #selection llm
    llm_provider: str = "ollama"
    llm_model: str = "qwen3:4b"

    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def llm_selection(self) -> LLMSelection:
        return LLMSelection(
            provider=self.llm_provider,
            model = self.llm_model
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
