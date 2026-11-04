import re
import subprocess
from pathlib import Path


def get_head_commit(repository_root: Path) -> str:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repository_root),
            "rev-parse",
            "HEAD",
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    )

    commit_sha = result.stdout.strip()

    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", commit_sha):
        raise ValueError("Git returned an invalid commit SHA")

    return commit_sha.lower()
     