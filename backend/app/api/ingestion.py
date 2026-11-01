import subprocess
from pathlib import Path
from fastapi import HTTPException, APIRouter
from app.ingestion.models import IngestionResult
from app.ingestion.service import ingest_repository

from app.core import get_settings

router = APIRouter(prefix="/api/v1", tags=["Ingestion"])

@router.post("/repositories/demo/ingest", response_model=IngestionResult)
def ingest_demo_repository() -> IngestionResult:
    settings = get_settings()

    if settings.environment != "development":
        raise HTTPException(
            status_code=403,
            detail="Local ingestion is disabled",
        )

    if not settings.demo_repository_path:
        raise HTTPException(
            status_code=400,
            detail="Demo repository is not configured"
        )
    try:
        return ingest_repository(
            repo_path= Path(settings.demo_repository_path),
            repo_id="demo-repository",
        )
    except (ValueError, OSError, subprocess.CalledProcessError):
        raise HTTPException(
            status_code=400,
            detail="Unable to ingest the configure repository"
        )