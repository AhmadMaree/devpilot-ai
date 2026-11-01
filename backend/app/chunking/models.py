from pydantic import BaseModel, Field


class SourceChunk(BaseModel):
    chunk_id: str
    repository_id: str
    commit_sha: str
    file_path: str
    language: str
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    content: str
    content_sha256: str
