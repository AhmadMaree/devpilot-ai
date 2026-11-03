import subprocess
import os

from pathlib import Path
from .models import IngestionResult

from app.utils import ensure_clean_repositery

from .filters import IGNORED_DIR, should_include_file

from .reader import read_source_file


def get_commit_sha(root: Path) -> str:
    res = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
        timeout=10,
    )

    return res.stdout.strip()


def ingest_repository(repo_id: str, repo_path: Path) -> IngestionResult:

    root = repo_path.resolve(strict=True)

    if not root.is_dir():
        raise ValueError("Repository Path must be a dirctory")

    ## check if there uncommit changes.
    ensure_clean_repositery(root)

    commit_sha = get_commit_sha(root)

    decouments = []
    skipped_files = 0

    for current_root, dirctories, filenames in os.walk(root, followlinks=False):
        dirctories[:] = sorted(
            dirctory
            for dirctory in dirctories
            if dirctory not in IGNORED_DIR
            and not (Path(current_root) / dirctory).is_symlink()
        )

        for filename in sorted(filenames):
            path = Path(current_root) / filename

            if not should_include_file(path, root):
                skipped_files += 1
                continue

            try:
                document = read_source_file(
                    path=path, root=root, repository_id=repo_id, commit_sha=commit_sha
                )

                decouments.append(document)
            except (UnicodeError, OSError):
                skipped_files += 1

    return IngestionResult(
        repository_id=repo_id,
        documents=decouments,
        commit_sha=commit_sha,
        skipped_files=skipped_files,
        indexed_files=len(decouments),
    )
