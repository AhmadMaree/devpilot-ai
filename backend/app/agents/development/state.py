from app.patches.models import PatchProposal
from typing import TypedDict

class DevelopmentState(TypedDict):
    repository_id: str
    file_path: str
    instruction: str

    proposal: PatchProposal | None
    developer_status: str
    developer_feedback: str

    review_passed: bool
    review_feedback: str

    qa_passed: bool
    qa_feedback: str

    error: str | None
    workflow_status: str