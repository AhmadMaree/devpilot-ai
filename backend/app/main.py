from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.repositories import router as repositories_router
from app.repositories.index_job_manager import RepositoryIndexJobManager

from .api.agents import router as agent_router
from .api.ingestion import router as ingestion_router
from .api.llm import router as llm_router
from .api.patches import router as patches_router
from .api.questions import router as questions_router
from app.api.development import router as development_router
from .api.routes import router
from .core import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager = RepositoryIndexJobManager()
        manager.start()
        app.state.index_job_manager = manager
        try:
            yield
        finally:
            manager.shutdown()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_headers=["Content-Type"],
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_credentials=False,
    )

    app.include_router(router)
    app.include_router(ingestion_router)
    app.include_router(questions_router)
    app.include_router(agent_router)
    app.include_router(patches_router)
    app.include_router(llm_router)
    app.include_router(repositories_router)
    app.include_router(development_router)

    return app


app = create_app()
