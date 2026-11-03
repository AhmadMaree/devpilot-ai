import hashlib
import tempfile
import os
from pathlib import Path
from .models import PatchProposal, PatchResult


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resolve_target(
    repository_root: Path,
    file_path: str,
) -> Path:
    root = repository_root.resolve(strict=True)

    if not root.is_dir():
        raise ValueError("Repository root is not a directory")

    relative = Path(file_path)

    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Invalid repository-relative path")

    target = root / relative

    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlink paths are not allowed")

    resolved = target.resolve(strict=True)
    if not resolved.is_relative_to(root):
        raise ValueError("Path escapes repository root")
    if not resolved.is_file():
        raise ValueError("Target must be an existing file")
    return resolved


def apply_approved_patch(
    repository_root: Path, proposal: PatchProposal, *, approved: bool
) -> PatchResult:

    if not approved:
        return PatchResult(
            file_path=proposal.file_path,
            applied=False,
            message="Human approval is required.",
        )

    if proposal.repository_id != "demo-repository":
        raise ValueError("Repository is not authorized")

    target = resolve_target(repository_root, proposal.file_path)

    if target.suffix not in {
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".md",
        ".css",
        ".scss",
    }:
        raise ValueError("File type is not allowed")

    original = target.read_bytes()

    if len(original) > 256 * 1024:
        raise ValueError("Target file exceeds size limit")

    if sha256(original) != proposal.expected_sha256:
        raise ValueError("File changed since the patch was proposed")

    replacement = proposal.replacement_content.encode("utf-8")

    if len(replacement) > 256 * 1024:
        raise ValueError("Replacement exceeds size limit")

    if replacement == original:
        return PatchResult(
            file_path=proposal.file_path,
            applied=False,
            message="No changes to apply.",
        )

    # write on temp the new content then atomically replace the original
    temporary_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=target.parent, prefix=".devpilot-", delete=False
        ) as temp:
            temp.write(replacement)
            temporary_path = Path(temp.name)

        os.chmod(temporary_path, target.stat().st_mode)
        os.replace(temporary_path, target)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return PatchResult(
        file_path=proposal.file_path,
        applied=True,
        message="Approved patch applied successfully.",
    )
