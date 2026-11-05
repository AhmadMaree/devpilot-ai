from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RegisterRepositoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    path: str = Field(min_length=1)


class Repository(BaseModel):
    id: UUID
    name: str
    path: str
    created_at: datetime


class ImportGitHubRepositoryRequest(BaseModel):
    url: str = Field(min_length=1, max_length=300)
