from hmac import compare_digest

from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader

from app.core import get_settings


api_key_header = APIKeyHeader(
    name = "X_API_KEY",
    auto_error=False
)


def require_api_key(
    api_key: str | None = Security(api_key_header)
) -> None:
    settings = get_settings()
    excpected_key = settings.local_api_key.get_secret_value()

    if not excpected_key:
        raise HTTPException(
            status_code= status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local API authentication is not configured"
        )

    if not api_key or not compare_digest(
        api_key.encode("utf-8"),
        excpected_key.encode("utf-8")
    ):
        raise HTTPException(
            status_code= status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "APIKey"}
        )

    