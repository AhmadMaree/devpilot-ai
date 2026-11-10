from hashlib import sha256
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import development
from app.api.patches import get_patch_store
from app.core.security import require_api_key
from app.main import app
from app.patches.models import PatchProposal
from app.patches.store import PatchProposalStore
from app.repositories.store import RepositoryStore
from app.storage.development_workflows import DevelopmentWorkflowStore


@pytest.fixture
def workflow_api(tmp_path, monkeypatch):
    database = tmp_path / "test.db"
    repository_root = tmp_path / "repository"
    repository_root.mkdir()

    source_file = repository_root / "example.py"
    source_file.write_text("value = 1\n", encoding="utf-8")

    repository_store = RepositoryStore(database)
    repository_store.initialize()

    repository = repository_store.create(
        name="test-repository",
        path=str(repository_root),
    )

    repository_id = UUID(str(repository.id))

    patch_store = PatchProposalStore(database)
    patch_store.initialize()

    history_store = DevelopmentWorkflowStore(database)
    history_store.initialize()

    # Redirect the endpoint's PostgreSQL store to the isolated test database.
    monkeypatch.setattr(
        development,
        "PostgresRepositoryStore",
        lambda: repository_store,
    )
    monkeypatch.setattr(
        development,
        "ensure_repository_checkout",
        lambda repository: repository_root,
    )

    class FakeProvider:
        def generate(self, *args, **kwargs):
            return "mocked LLM output"

    class FakeFactory:
        def __init__(self, selection):
            pass

        def create_patch_provider(self):
            return FakeProvider()

    monkeypatch.setattr(
        development,
        "LLMProviderFactory",
        FakeFactory,
    )

    class FakeLLMSelectionStore:
        def get(self, fallback):
            return fallback

    monkeypatch.setattr(
        development,
        "PostgresLLMSelectionStore",
        FakeLLMSelectionStore,
    )

    # These tests cover workflow behavior, not API-key authentication.
    app.dependency_overrides[require_api_key] = lambda: None
    app.dependency_overrides[get_patch_store] = lambda: patch_store
    app.dependency_overrides[development.get_workflow_store] = lambda: history_store

    # Do not run the production lifespan, which requires PostgreSQL.
    client = TestClient(app)
    yield {
        "client": client,
        "repository_id": repository_id,
        "repository_root": repository_root,
        "patch_store": patch_store,
        "history_store": history_store,
        "database": database,
    }
    client.close()

    app.dependency_overrides.clear()


def request_body(repository_id):
    return {
        "repository_id": str(repository_id),
        "file_path": "example.py",
        "instruction": "Improve this example implementation",
    }


def make_proposal(repository_id, repository_root):
    source = (Path(repository_root) / "example.py").read_bytes()

    return PatchProposal(
        repository_id=str(repository_id),
        file_path="example.py",
        expected_sha256=sha256(source).hexdigest(),
        replacement_content="value = 2\n",
        explanation="Improve the example",
    )


def workflow_result(
    *,
    status,
    proposal=None,
    review_passed=False,
    qa_passed=False,
):
    return {
        "workflow_status": status,
        "developer_status": "completed",
        "developer_feedback": "Developer completed",
        "review_passed": review_passed,
        "review_feedback": "Review completed",
        "qa_passed": qa_passed,
        "qa_feedback": "QA completed",
        "error": None,
        "proposal": proposal,
    }


def test_success_creates_proposal_and_history(
    workflow_api,
    monkeypatch,
):
    repository_id = workflow_api["repository_id"]

    proposal = make_proposal(
        repository_id,
        workflow_api["repository_root"],
    )

    monkeypatch.setattr(
        development,
        "run_development_workflow",
        lambda **kwargs: workflow_result(
            status="ready_for_approval",
            proposal=proposal,
            review_passed=True,
            qa_passed=True,
        ),
    )

    monkeypatch.setattr(
        development,
        "preview_patch",
        lambda **kwargs: "-value = 1\n+value = 2",
    )

    client = workflow_api["client"]

    response = client.post(
        "/api/v1/development/workflows",
        json=request_body(repository_id),
    )

    assert response.status_code == 200, response.text

    result = response.json()

    assert result["workflow_status"] == "ready_for_approval"
    assert result["proposal_id"] is not None
    assert result["diff"]

    proposal_saved = workflow_api["patch_store"].get(result["proposal_id"])

    assert proposal_saved is not None
    assert proposal_saved["status"] == "pending"

    history = workflow_api["history_store"].list_by_repository(repository_id)

    assert len(history) == 1
    assert history[0]["proposal_id"] == result["proposal_id"]

    detail = client.get(f"/api/v1/development/workflows/{history[0]['id']}")

    assert detail.status_code == 200
    assert detail.json()["response"]["qa_passed"] is True


def test_rejected_workflow_saves_history_without_proposal(
    workflow_api,
    monkeypatch,
):
    repository_id = workflow_api["repository_id"]

    monkeypatch.setattr(
        development,
        "run_development_workflow",
        lambda **kwargs: workflow_result(
            status="review_rejected",
            review_passed=False,
        ),
    )

    client = workflow_api["client"]

    response = client.post(
        "/api/v1/development/workflows",
        json=request_body(repository_id),
    )

    assert response.status_code == 200
    assert response.json()["proposal_id"] is None

    history_response = client.get(
        "/api/v1/development/workflows",
        params={"repository_id": str(repository_id)},
    )

    assert history_response.status_code == 200

    history = history_response.json()

    assert len(history) == 1
    assert history[0]["status"] == "review_rejected"
    assert history[0]["proposal_id"] is None


def test_timeout_is_persisted(
    workflow_api,
    monkeypatch,
):
    def raise_timeout(**kwargs):
        raise httpx.ReadTimeout("Provider timed out")

    monkeypatch.setattr(
        development,
        "run_development_workflow",
        raise_timeout,
    )

    repository_id = workflow_api["repository_id"]

    response = workflow_api["client"].post(
        "/api/v1/development/workflows",
        json=request_body(repository_id),
    )

    assert response.status_code == 504

    history = workflow_api["history_store"].list_by_repository(repository_id)

    assert len(history) == 1
    assert history[0]["status"] == "failed"

    saved = workflow_api["history_store"].get(UUID(history[0]["id"]))

    assert saved["response"]["error"] == ("Development workflow timed out")


def test_repository_history_is_isolated(workflow_api):
    first_repository_id = workflow_api["repository_id"]
    second_repository_id = uuid4()

    workflow_api["history_store"].create(
        repository_id=first_repository_id,
        file_path="example.py",
        instruction="Improve example implementation",
        status="failed",
        response={"error": "Example failure"},
    )

    # A different repository cannot retrieve the first
    # repository's records through the list endpoint.
    response = workflow_api["client"].get(
        "/api/v1/development/workflows",
        params={"repository_id": str(second_repository_id)},
    )

    assert response.status_code == 404

    first_response = workflow_api["client"].get(
        "/api/v1/development/workflows",
        params={"repository_id": str(first_repository_id)},
    )

    assert first_response.status_code == 200
    assert len(first_response.json()) == 1
