
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.llm.models import LLMSelection
from app.storage.database import get_database_engine


class PostgresLLMSelectionStore:
    """PostgreSQL-backed LLM provider and model selection."""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = (
            engine if engine is not None else get_database_engine()
        )

    def initialize(self) -> None:
        """Alembic manages the database schema."""
        return None

    def get(self, fallback: LLMSelection) -> LLMSelection:
        with self.engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT provider, model
                    FROM llm_settings
                    WHERE id = 1
                """)
            ).mappings().first()

        if row is None:
            return fallback

        return LLMSelection(
            provider=row["provider"],
            model=row["model"],
        )

    def save(self, selection: LLMSelection) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO llm_settings (
                        id,
                        provider,
                        model
                    )
                    VALUES (
                        1,
                        :provider,
                        :model
                    )
                    ON CONFLICT (id)
                    DO UPDATE SET
                        provider = EXCLUDED.provider,
                        model = EXCLUDED.model
                """),
                {
                    "provider": selection.provider.value,
                    "model": selection.model,
                },
            )
