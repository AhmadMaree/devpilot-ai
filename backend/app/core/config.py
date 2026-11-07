from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr
from app.llm.models import LLMSelection
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "DevPilot AI"
    app_version: str = "0.1.0"
    environment: str = "development"
    frontend_origin: str = "http://localhost:5173"
    demo_repository_path: str = ""
    ollama_base_url: str = "http://localhost:11434"

    #selection llm
    llm_provider: str = "ollama"
    llm_model: str = "qwen3:4b"

    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    github_workspace_dir: Path = Path(
        "D:/Projects/devpilot-managed-repositories"
    )

    # Storage
    data_dir: Path = BACKEND_ROOT / "data"
    database_filename: str = "devpilot.db"

    #apikey
    local_api_key: SecretStr = SecretStr("")

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def llm_selection(self) -> LLMSelection:
        return LLMSelection(
            provider=self.llm_provider,
            model = self.llm_model
        )

    @property
    def resolved_github_workspace_dir(self) -> Path:
        path = self.github_workspace_dir.expanduser()

        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return path.resolve()
    
    @property
    def resolved_data_dir(self) -> Path:
        path = self.data_dir.expanduser()
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return path.resolve()
    
    @property
    def database_path(self) -> Path:
        return self.resolved_data_dir / self.database_filename

    @property
    def indexes_dir(self) -> Path:
        return self.resolved_data_dir / "indexes"


@lru_cache
def get_settings() -> Settings:
    return Settings()
