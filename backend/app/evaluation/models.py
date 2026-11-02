
from pydantic import BaseModel, Field


class EvaluationCase(BaseModel):
    id: str
    question: str = Field(min_length=3, description="The question to be answered")
    repository_id: str
    relative_files: list[str] = Field(min_length=1)
    

class EvaluationDatabase:
    cases : list[EvaluationCase] = Field(min_length=1)


class CaseResult(BaseModel):
    id: str
    question: str
    expected_files: list[str]
    retrieved_files: list[str]
    recall_at_k: float
    reciprocal_rank: float
    latency_ms: float

class RetrievalSummary(BaseModel):
    method: str
    cases: int
    mean_recall_at_k: float
    mrr_at_k: float
    mean_latency_ms: float
    results: list[CaseResult]


class EvaluationReport(BaseModel):
    commit_sha: str
    top_k: int
    semantic: RetrievalSummary
    keyword: RetrievalSummary