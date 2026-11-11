import logging
import smtplib
import ssl
from datetime import UTC, datetime
from email.message import EmailMessage

from app.core import get_settings

logger = logging.getLogger(__name__)


def _browser_category(user_agent: str) -> str:
    agent = user_agent.lower()

    if "edg/" in agent or "edga/" in agent or "edgios/" in agent:
        return "Edge"
    if "opr/" in agent or "opera" in agent:
        return "Opera"
    if "firefox/" in agent or "fxios/" in agent:
        return "Firefox"
    if "chrome/" in agent or "chromium/" in agent or "crios/" in agent:
        return "Chrome"
    if "safari/" in agent:
        return "Safari"
    return "Other"


def _device_category(user_agent: str) -> str:
    agent = user_agent.lower()

    if "ipad" in agent or "tablet" in agent:
        return "tablet"
    if "mobile" in agent or "iphone" in agent or "ipod" in agent:
        return "mobile"
    if "android" in agent:
        return "tablet"
    return "desktop"


def _send_message(
    server: smtplib.SMTP,
    message: EmailMessage,
    *,
    username: str,
    password: str,
) -> None:
    if username:
        server.login(username, password)
    server.send_message(message)


def send_login_alert(user_agent: str) -> None:
    settings = get_settings()

    if not settings.smtp_host or not settings.smtp_from_email:
        logger.warning("Demo sign-in alert email not sent: SMTP is not configured")
        return

    message = EmailMessage()
    message["Subject"] = "DevPilot AI demo sign-in"
    message["From"] = settings.smtp_from_email
    message["To"] = settings.login_alert_email
    message.set_content(
        "A successful demo sign-in occurred.\n\n"
        f"Time (UTC): {datetime.now(UTC).isoformat(timespec='seconds')}\n"
        f"Browser category: {_browser_category(user_agent)}\n"
        f"Device category: {_device_category(user_agent)}\n"
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=10,
                context=ssl.create_default_context(),
            ) as server:
                _send_message(
                    server,
                    message,
                    username=settings.smtp_username,
                    password=settings.smtp_password.get_secret_value(),
                )
        else:
            with smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=10,
            ) as server:
                if settings.smtp_use_starttls:
                    server.starttls(context=ssl.create_default_context())
                _send_message(
                    server,
                    message,
                    username=settings.smtp_username,
                    password=settings.smtp_password.get_secret_value(),
                )
    except (OSError, smtplib.SMTPException):
        logger.exception("Could not send demo sign-in alert email")
