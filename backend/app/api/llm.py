
import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core import get_settings
from app.llm.models import LLMProviderType, LLMSelection
from app.llm.store import LLMSelectionStore
from google import genai


router = APIRouter(
    prefix="/api/v1/llm",
    tags=["LLM Settings"],
)

def require_development() -> None:
    if get_settings().environment != "development":
        raise HTTPException(
            status_code=403,
            detail="LLM settings API is disabled",
        )


def get_selection_store() -> LLMSelectionStore:
    return LLMSelectionStore()


def get_available_gemini_models() -> set[str]:
    settings = get_settings()

    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not configured")
    with genai.Client(api_key=settings.gemini_api_key) as client:
        models = client.models.list()
        
        return {
            model.name.removeprefix("models/")
            for model in models
            if model.name
            and "generateContent" in (
                model.supported_actions or []
            )
        }


@router.get("/providers")
def list_providers(
    _: None = Depends(require_development),
):
    settings = get_settings()
    return [
        {
            "id": "ollama",
            "name": "Ollama",
            "available": True,
        },
        {
            "id": "gemini",
            "name": "Google Gemini",
            "available": bool(settings.gemini_api_key),
        },
    ]



@router.get("/models")
def list_models(
    provider: LLMProviderType = LLMProviderType.OLLAMA,
    _: None = Depends(require_development),
):  
    if provider == LLMProviderType.OLLAMA:
        try:
            response = httpx.get(
                "http://127.0.0.1:11434/api/tags",
                timeout=10,
            )
            response.raise_for_status()
            payload = response.json()

            models = payload.get("models", [])

            return [
                {
                    "name": model["name"],
                    "size": model.get("size"),
                }
                for model in models
                if isinstance(model, dict)
                and isinstance(model.get("name"), str)
            ]

        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(
                status_code=503,
                detail="Unable to retrieve Ollama models",
            ) from None
    elif provider == LLMProviderType.GEMINI:
        return [
            {"name": name, "size": None}
            for name in sorted(get_available_gemini_models())
        ]
    else:
        raise HTTPException(
            status_code=422,
            detail="Selected provider is not implemented",
        )

@router.get("/selection", response_model=LLMSelection)
def get_selection(
    store: LLMSelectionStore = Depends(get_selection_store),
    _: None = Depends(require_development),
):
    return store.get(
        fallback=get_settings().llm_selection
    )


@router.put("/selection", response_model=LLMSelection)
def update_selection(
    selection: LLMSelection,
    store: LLMSelectionStore = Depends(get_selection_store),
    _: None = Depends(require_development),
):
    if selection.provider == LLMProviderType.OLLAMA:
        try:
            response = httpx.get(
                "http://127.0.0.1:11434/api/tags",
                timeout=10,
            )
            response.raise_for_status()

            available_models = {
                item["name"]
                for item in response.json().get("models", [])
                if isinstance(item, dict)
                and isinstance(item.get("name"), str)
            }

        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(
                status_code=503,
                detail="Unable to verify Ollama models",
            ) from None
    elif selection.provider == LLMProviderType.GEMINI:
        available_models = get_available_gemini_models()
    else:
        raise HTTPException(
            status_code=422,
            detail="Selected provider is not implemented",
        )

    if selection.model not in available_models:
        raise HTTPException(
            status_code=422,
            detail="Selected model is not installed in Ollama",
        )

    store.save(selection)
    return selection