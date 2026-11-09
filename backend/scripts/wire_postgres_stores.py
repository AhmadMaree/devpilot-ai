
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "app"

REPLACEMENTS = {
    "api/agents.py": {
        "from app.repositories.store import RepositoryStore":
            "from app.repositories.postgres_store import PostgresRepositoryStore",
        "from app.storage.investigations import InvestigationStore":
            "from app.storage.postgres_investigations import PostgresInvestigationStore",
        "RepositoryStore()": "PostgresRepositoryStore()",
        "InvestigationStore": "PostgresInvestigationStore",
    },
    "api/development.py": {
        "from app.llm.store import LLMSelectionStore":
            "from app.llm.postgres_store import PostgresLLMSelectionStore",
        "from app.patches.store import PatchProposalStore":
            "from app.patches.postgres_store import PostgresPatchProposalStore",
        "from app.repositories.store import RepositoryStore":
            "from app.repositories.postgres_store import PostgresRepositoryStore",
        "from app.storage.development_workflows import DevelopmentWorkflowStore":
            "from app.storage.postgres_development_workflows import PostgresDevelopmentWorkflowStore",
        "RepositoryStore()": "PostgresRepositoryStore()",
        "LLMSelectionStore": "PostgresLLMSelectionStore",
        "PatchProposalStore": "PostgresPatchProposalStore",
        "DevelopmentWorkflowStore": "PostgresDevelopmentWorkflowStore",
    },
    "api/questions.py": {
        "from app.repositories.store import RepositoryStore":
            "from app.repositories.postgres_store import PostgresRepositoryStore",
        "RepositoryStore()": "PostgresRepositoryStore()",
    },
    "api/patches.py": {
        "from app.llm.store import LLMSelectionStore":
            "from app.llm.postgres_store import PostgresLLMSelectionStore",
        "from app.patches.store import PatchProposal, PatchProposalStore":
            "from app.patches.models import PatchProposal\nfrom app.patches.postgres_store import PostgresPatchProposalStore",
        "from app.repositories.store import RepositoryStore":
            "from app.repositories.postgres_store import PostgresRepositoryStore",
        "RepositoryStore()": "PostgresRepositoryStore()",
        "LLMSelectionStore": "PostgresLLMSelectionStore",
        "PatchProposalStore": "PostgresPatchProposalStore",
    },
    "api/llm.py": {
        "from app.llm.store import LLMSelectionStore":
            "from app.llm.postgres_store import PostgresLLMSelectionStore",
        "LLMSelectionStore": "PostgresLLMSelectionStore",
    },
    "llm/selection.py": {
        "from app.llm.store import LLMSelectionStore":
            "from app.llm.postgres_store import PostgresLLMSelectionStore",
        "LLMSelectionStore()": "PostgresLLMSelectionStore()",
    },
    "repositories/index_service.py": {
        "from app.repositories.index_store import RepositoryIndexStore":
            "from app.repositories.postgres_index_store import PostgresRepositoryIndexStore",
        "RepositoryIndexStore()": "PostgresRepositoryIndexStore()",
    },
}

# Avoid replacing the same identifier twice, including inside
# newly written import names.
IMPORT_NAMES = {
    "InvestigationStore",
    "DevelopmentWorkflowStore",
    "PatchProposalStore",
    "LLMSelectionStore",
}


def transform(source: str, replacements: dict[str, str]) -> str:
    import re

    # Replace complete import lines first.
    for old, new in replacements.items():
        if old.startswith("from "):
            if old not in source:
                raise ValueError(f"Expected import not found: {old}")
            source = source.replace(old, new)

    # Replace only standalone legacy identifiers and calls.
    for old, new in replacements.items():
        if old.startswith("from "):
            continue

        if old.endswith("()"):
            legacy_name = old[:-2]
            replacement = new
            pattern = rf"(?<!Postgres)\b{legacy_name}\(\)"
        else:
            replacement = new
            pattern = rf"(?<!Postgres)\b{re.escape(old)}\b"

        source = re.sub(pattern, replacement, source)

    return source



def main() -> None:
    changes: list[tuple[Path, str, str]] = []

    # Validate every file before writing anything.
    for relative_path, replacements in REPLACEMENTS.items():
        path = ROOT / relative_path
        original = path.read_text(encoding="utf-8")
        updated = transform(original, replacements)

        compile(updated, str(path), "exec")

        if updated != original:
            changes.append((path, original, updated))

    for path, original, updated in changes:
        backup = path.with_suffix(path.suffix + ".pre-postgres.bak")
        if backup.exists():
            raise FileExistsError(
                f"Backup already exists: {backup}"
            )
        backup.write_text(original, encoding="utf-8")
        path.write_text(updated, encoding="utf-8")
        print(f"Updated: {path.relative_to(ROOT.parent)}")

    print(f"Completed: {len(changes)} files updated.")


if __name__ == "__main__":
    main()
