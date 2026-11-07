from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class InvestigationRequest(BaseModel):
    repository_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=3, max_length=2000)


class InvestigationSource(BaseModel):
    source_id: str
    chunk_id: str
    file_path: str
    start_line: int
    end_line: int
    commit_sha: str
    snippet: str | None = None


class InvestigationResponse(BaseModel):
    repository_id: str
    question: str
    plan: str
    answer: str
    review_passed: bool
    review_feedback: str
    attempts: int
    sources: list[InvestigationSource]


class SavedInvestigation(BaseModel):
    id: UUID
    created_at: datetime
    result: InvestigationResponse


class InvestigationSummary(BaseModel):
    id: UUID
    repository_id: str
    question: str
    review_passed: bool
    created_at: datetime
