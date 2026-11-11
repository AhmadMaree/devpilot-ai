from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from pydantic import BaseModel, Field

from app.auth.login_alerts import send_login_alert
from app.auth.passwords import verify_password
from app.auth.postgres_sessions import (
    Session,
    clear_login_failures,
    create_session,
    get_session,
    login_allowed,
    record_login_failure,
    revoke_session,
)
from app.core import get_settings
from app.core.security import (
    SESSION_COOKIE,
    same_origin_required,
)

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["authentication"],
)

LOGIN_BUCKET = "local-admin"


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


class AuthResponse(BaseModel):
    authenticated: bool
    csrf_token: str
    expires_at: int


class LogoutResponse(BaseModel):
    success: bool


def current_session(request: Request) -> Session:
    token = request.cookies.get(SESSION_COOKIE, "")
    session = get_session(token)

    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    return session


@router.post("/login", response_model=AuthResponse)
def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
) -> AuthResponse:
    same_origin_required(request)

    settings = get_settings()
    stored_hash = settings.auth_password_hash.get_secret_value()

    if not stored_hash:
        raise HTTPException(
            status_code=503,
            detail="Browser authentication is not configured",
        )

    if not login_allowed(LOGIN_BUCKET):
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": "900"},
        )

    if not verify_password(credentials.password, stored_hash):
        record_login_failure(LOGIN_BUCKET)

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    clear_login_failures(LOGIN_BUCKET)

    # Revoke an existing browser session before replacement.
    old_token = request.cookies.get(SESSION_COOKIE, "")
    if old_token:
        revoke_session(old_token)

    token, session = create_session()
    background_tasks.add_task(
        send_login_alert,
        request.headers.get("user-agent", ""),
    )

    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
        max_age=settings.auth_session_hours * 3600,
    )

    response.headers["Cache-Control"] = "no-store"

    return AuthResponse(
        authenticated=True,
        csrf_token=session.csrf_token,
        expires_at=session.expires_at,
    )


@router.get("/me", response_model=AuthResponse)
def me(
    response: Response,
    session: Session = Depends(current_session),
) -> AuthResponse:
    response.headers["Cache-Control"] = "no-store"

    return AuthResponse(
        authenticated=True,
        csrf_token=session.csrf_token,
        expires_at=session.expires_at,
    )


@router.post("/logout", response_model=LogoutResponse)
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(current_session),
) -> LogoutResponse:
    same_origin_required(request)

    supplied_csrf = request.headers.get("X-CSRF-Token", "")

    from hmac import compare_digest

    if not compare_digest(supplied_csrf, session.csrf_token):
        raise HTTPException(
            status_code=403,
            detail="Invalid CSRF token",
        )

    token = request.cookies.get(SESSION_COOKIE, "")
    revoke_session(token)

    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        secure=get_settings().auth_cookie_secure,
        httponly=True,
        samesite="lax",
    )

    response.headers["Cache-Control"] = "no-store"

    return LogoutResponse(success=True)
