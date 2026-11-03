import difflib
import hashlib
from pathlib import Path

from app.patches.models import PatchProposal
from app.patches.service import resolve_target


def preview_patch(
    repository_root: Path,
    proposal: PatchProposal,
) -> str:

    target = resolve_target(
        repository_root,
        proposal.file_path,
    )

    original = target.read_bytes()

    # check if there chnages on file happens bfore propsal.
    if hashlib.sha256(original).hexdigest() != (proposal.expected_sha256):
        raise ValueError("File changed since proposal creation")

    old_lines = original.decode("utf-8").splitlines(keepends=True)
    new_lines = proposal.replacement_content.splitlines(keepends=True)

    return "".join(
        difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile=f"a/{proposal.file_path}",
            tofile=f"b/{proposal.file_path}",
        )
    )
