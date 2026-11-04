from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .api.ingestion import router as ingestion_router
from .api.questions import router as questions_router
from .api.agents import router as agent_router
from .api.patches import router as patches_router
from .core import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_headers=["Content-Type"],
        allow_methods=["GET", "POST"],
        allow_credentials=False,
    )

    app.include_router(router)
    app.include_router(ingestion_router)
    app.include_router(questions_router)
    app.include_router(agent_router)
    app.include_router(patches_router)

    return app


app = create_app()
