import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.repositories import router as repositories_router
from app.auth.postgres_sessions import initialize_auth_tables
from app.core.security import require_api_key
from app.repositories.index_job_manager import RepositoryIndexJobManager
from app.storage.database import get_database_engine

from .api.agents import router as agent_router
from .api.development import router as development_router
from .api.ingestion import router as ingestion_router
from .api.llm import router as llm_router
from .api.patches import router as patches_router
from .api.questions import router as questions_router
from .api.routes import router
from .core import get_settings

logger = logging.getLogger(__name__)

EXPECTED_ALEMBIC_REVISION = "49aba8ffcb51"


def verify_database_schema() -> None:
    """Fail startup if PostgreSQL is unavailable or not migrated."""
    engine = get_database_engine()

    with engine.connect() as connection:
        connection.execute(text("SELECT 1")).scalar_one()

        revisions = (
            connection.execute(text("SELECT version_num FROM alembic_version"))
            .scalars()
            .all()
        )

    if revisions != [EXPECTED_ALEMBIC_REVISION]:
        raise RuntimeError(
            "Unexpected PostgreSQL schema revision. "
            f"Expected {EXPECTED_ALEMBIC_REVISION}; "
            f"found {revisions}. "
            "Run Alembic migrations before starting the API."
        )


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = get_database_engine()
        manager: RepositoryIndexJobManager | None = None

        try:
            verify_database_schema()

            # PostgreSQL auth tables already exist via Alembic.
            initialize_auth_tables()

            manager = RepositoryIndexJobManager(
                use_postgres=True,
            )

            manager.start()
            app.state.index_job_manager = manager

            logger.info("DevPilot AI started with PostgreSQL persistence")

            yield

        finally:
            if manager is not None:
                manager.shutdown()

            engine.dispose()

            logger.info("DevPilot AI shutdown completed")

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_headers=[
            "Content-Type",
            "X-API-Key",
            "X-CSRF-Token",
        ],
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_credentials=False,
    )

    # Public routes.
    app.include_router(router)
    app.include_router(auth_router)

    # Protected routes.
    protected = [Depends(require_api_key)]

    app.include_router(
        ingestion_router,
        dependencies=protected,
    )
    app.include_router(
        questions_router,
        dependencies=protected,
    )
    app.include_router(
        agent_router,
        dependencies=protected,
    )
    app.include_router(
        patches_router,
        dependencies=protected,
    )
    app.include_router(
        llm_router,
        dependencies=protected,
    )
    app.include_router(
        repositories_router,
        dependencies=protected,
    )
    app.include_router(
        development_router,
        dependencies=protected,
    )

    return app


app = create_app()
