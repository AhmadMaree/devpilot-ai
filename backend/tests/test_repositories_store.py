from pathlib import Path
from uuid import UUID

from app.repositories.store import RepositoryStore


def test_repository_store_persists_path_and_supports_lookup(tmp_path: Path) -> None:
    store = RepositoryStore(tmp_path / "repositories.db")
    repository_path = tmp_path / "project"
    repository_path.mkdir()

    created = store.create(name="Project", path=repository_path)

    assert created.path == str(repository_path)
    assert isinstance(created.id, UUID)
    assert store.get(created.id) == created
    assert store.list_all() == [created]
    assert store.delete(created.id)
    assert store.get(created.id) is None
