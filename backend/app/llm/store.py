import sqlite3
from pathlib import Path

from app.core import get_settings
from app.llm.models import LLMSelection


class LLMSelectionStore:
    def __init__(self, db_path: Path | str | None = None):
        self.db_path = Path(
            db_path if db_path is not None else get_settings().database_path
        )

    def initialize(self) -> None:
        self.db_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_settings (
                    id INTEGER PRIMARY KEY
                        CHECK (id = 1),
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL
                )
                """
            )

    def get(self, fallback: LLMSelection) -> LLMSelection:
        self.initialize()

        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT provider, model
                FROM llm_settings
                WHERE id = 1
                """
            ).fetchone()

        if row is None:
            return fallback

        return LLMSelection(provider=row[0], model=row[1])

    def save(self, selection: LLMSelection) -> None:
        self.initialize()

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO llm_settings (
                    id, provider, model
                )
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    provider = excluded.provider,
                    model = excluded.model
                """,
                (
                    selection.provider.value,
                    selection.model,
                ),
            )
