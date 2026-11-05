import math
import re
import subprocess
from pathlib import Path


class RepositoryHasUncommittedChangesError(ValueError):
    pass


def ensure_clean_repositery(root: Path) -> None:
    results = subprocess.run(
        ["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"],
        check=True,
        text=True,
        capture_output=True,
        timeout=10,
    )

    # Check uncommit chnages in repository.
    if results.stdout.strip():
        raise RepositoryHasUncommittedChangesError(
            "Repository contains uncommitted changes. "
            "Commit or clean the repository before ingestion."
        )


## check similarty (local)
def cosine_similarity(first: list[float], sec: list[float]) -> float:

    if len(first) != len(sec):
        raise ValueError("Vector dimensions do not match")

    dot_product = sum(a * b for a, b in zip(first, sec))

    first_norm = math.sqrt(sum(x * x for x in first))
    second_norm = math.sqrt(sum(x * x for x in sec))

    if first_norm == 0 or second_norm == 0:
        return 0.0

    return dot_product / (first_norm * second_norm)


def tokenizer(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", text.lower())
