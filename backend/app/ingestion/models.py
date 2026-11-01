
from pydantic import BaseModel, Field


## Represent one source File.
class SourceDocument(BaseModel):
    repository_id: str
    commit_sha: str
    file_path: str
    language: str
    content: str
    line_count: int
    content_sha256: str


class IngestionResult(BaseModel):
    repository_id: str
    commit_sha: str #tells us which exact revision was processed.
    documents: list[SourceDocument] = Field(default_factory=list)
    indexed_files: int = 0
    skipped_files: int = 0