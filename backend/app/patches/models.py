from pydantic import BaseModel, Field


class PatchProposal(BaseModel):
    repository_id: str = Field(min_length=1)
    file_path: str = Field(min_length=1)
    expected_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    replacement_content: str
    explanation: str = Field(min_length=1)


class PatchResult(BaseModel):
    file_path: str
    applied: bool
    message: str
