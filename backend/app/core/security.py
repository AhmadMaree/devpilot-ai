from hmac import compare_digest

from fastapi import Security, HTTPException, status, Request
from fastapi.security import APIKeyHeader

from app.auth.sessions import get_session
from app.core import get_settings


SESSION_COOKIE = "devpilot_session"
api_key_header = APIKeyHeader(
    name = "X-API-Key",
    auto_error=False
)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}



def same_origin_required(request: Request) -> None:
    """Reject cross-origin browser writes."""
    settings = get_settings()
    expected = settings.auth_browser_origin.rstrip("/")

    origin = request.headers.get("origin")

    if origin is not None:
        if origin.rstrip("/") != expected:
            raise HTTPException(
                status_code=403,
                detail="Origin not allowed",
            )
        return

    # Modern browsers send Fetch Metadata headers.
    # A cross-site request without Origin is rejected.
    fetch_site = request.headers.get("sec-fetch-site")

    if fetch_site not in (None, "same-origin", "none"):
        raise HTTPException(
            status_code=403,
            detail="Cross-site request rejected",
        )

def require_api_key(
    request: Request,
    api_key: str | None = Security(api_key_header)
) -> None:
    settings = get_settings()
    expected_key = settings.local_api_key.get_secret_value()

    # Existing script authentication.
    if api_key:
        if expected_key and compare_digest(
            api_key.encode("utf-8"),
            expected_key.encode("utf-8"),
        ):
            return

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )


    # Browser session authentication.
    session_token = request.cookies.get(SESSION_COOKIE)
    if session_token:
        session = get_session(session_token)

        if session is not None:
            if request.method not in SAFE_METHODS:
                same_origin_required(request)

                csrf_header = request.headers.get(
                    "X-CSRF-Token",
                    "",
                )

                if not compare_digest(
                    csrf_header,
                    session.csrf_token,
                ):
                    raise HTTPException(
                        status_code=403,
                        detail="Invalid CSRF token",
                    )

            return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )


    