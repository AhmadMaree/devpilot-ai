import hashlib

from pathlib import Path
from .models import SourceDocument
from .filters import get_language


def read_source_file(
    path: Path, root: Path, repository_id: str, commit_sha: str
) -> SourceDocument:

    language = get_language(path) or "unkown"

    raw_content = path.read_bytes()
    content = raw_content.decode("utf-8-sig")

    # Normlize content
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    relative_path = path.relative_to(root).as_posix()  # send path with slashes

    return SourceDocument(
        repository_id=repository_id,
        commit_sha=commit_sha,
        language=language,
        file_path=relative_path,
        content=content,
        line_count=len(content.splitlines()),
        content_sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
    )
