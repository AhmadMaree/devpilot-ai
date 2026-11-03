from typing import Literal

from pydantic import BaseModel, Field


class QuestionRequest(BaseModel):
    repository_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=3, max_length=2000)


class Citations(BaseModel):
    chunk_id: str
    repository_id: str
    commit_sha: str
    file_path: str
    start_line: int
    end_line: int
    score: float


class QuestionsAnswer(BaseModel):
    answer: str
    citation: list[Citations]
    status: Literal["completed", "insufficient_evidence"]
    model: str
