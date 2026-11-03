
from pathlib import Path

from app.agents.models import InvestigationResponse
from app.storage.investigations import InvestigationStore


def sample_result() -> InvestigationResponse:
    return InvestigationResponse(
        repository_id="demo-repository",
        question="Where is ingestion implemented?",
        plan="Find ingestion service",
        answer="Ingestion is implemented in service.py [S1].",
        review_passed=True,
        review_feedback="Citation labels validated.",
        attempts=1,
        sources=[],
    )


def test_save_and_get_investigation(tmp_path: Path):
    store = InvestigationStore(tmp_path / "test.db")
    store.initialize()

    saved = store.save(sample_result())

    assert saved["id"]
    assert saved["created_at"]
    assert saved["result"]["review_passed"] is True

    loaded = store.get(saved["id"])

    assert loaded is not None
    assert loaded["result"]["question"] == (
        "Where is ingestion implemented?"
    )


def test_history_survives_new_store_instance(tmp_path: Path):
    db_path = tmp_path / "test.db"

    first_store = InvestigationStore(db_path)
    first_store.initialize()
    first_store.save(sample_result())

    second_store = InvestigationStore(db_path)
    second_store.initialize()

    history = second_store.list_recent()

    assert len(history) == 1
    assert history[0]["repository_id"] == "demo-repository"


def test_unknown_investigation_returns_none(tmp_path: Path):
    store = InvestigationStore(tmp_path / "test.db")
    store.initialize()

    assert store.get("nonexistent") is None


def test_history_limit(tmp_path: Path):
    store = InvestigationStore(tmp_path / "test.db")
    store.initialize()

    for _ in range(5):
        store.save(sample_result())

    assert len(store.list_recent(limit=3)) == 3


def test_initialize_recovers_empty_directory_at_database_path(tmp_path: Path):
    db_path = tmp_path / "test.db"
    db_path.mkdir()
    store = InvestigationStore(db_path)

    store.initialize()

    assert db_path.is_file()
    assert store.list_recent() == []
