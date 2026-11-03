import hashlib

from app.ingestion.models import SourceDocument
from .models import SourceChunk


def chunk_document(
    document: SourceDocument, max_lines: int = 40, overlap_lines: int = 5
) -> list[SourceChunk]:

    if max_lines <= 0:
        raise ValueError("max_lines must be positive")

    if not 0 <= overlap_lines <= max_lines:
        raise ValueError(f"Overlap should be from zero until ${max_lines}")

    lines = document.content.splitlines()

    chunks: list[SourceChunk] = []

    if not lines:
        return []

    step = max_lines - overlap_lines

    for start in range(0, len(lines), step):
        end = min(start + max_lines, len(lines))

        content = "\n".join(lines[start:end])
        start_line = start + 1
        end_line = end

        id = (
            f"{document.repository_id}:"
            f"{document.commit_sha}:"
            f"{document.file_path}:"
            f"{start_line}:{end_line}"
            f"{content}"
        )

        chunk_id = hashlib.sha256(id.encode("utf-8")).hexdigest()

        chunks.append(
            SourceChunk(
                chunk_id=chunk_id,
                repository_id=document.repository_id,
                commit_sha=document.commit_sha,
                file_path=document.file_path,
                language=document.language,
                start_line=start_line,
                end_line=end_line,
                content=content,
                content_sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            )
        )

        if end == len(lines):
            break

    return chunks


def chunk_documents(
    documents: list[SourceDocument],
    max_lines: int = 40,
    overlap_lines: int = 5,
) -> list[SourceChunk]:

    return [
        chunk
        for doc in documents
        for chunk in chunk_document(
            document=doc, max_lines=max_lines, overlap_lines=overlap_lines
        )
    ]
