from types import SimpleNamespace

from pydantic import SecretStr

from app.auth import login_alerts


class FakeSMTP:
    def __init__(self):
        self.message = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def starttls(self, *, context):
        pass

    def login(self, username, password):
        pass

    def send_message(self, message):
        self.message = message


def test_login_alert_email_contains_only_coarse_browser_details(monkeypatch):
    settings = SimpleNamespace(
        smtp_host="smtp.example.test",
        smtp_port=587,
        smtp_username="sender",
        smtp_password=SecretStr("smtp-secret"),
        smtp_from_email="noreply@example.test",
        login_alert_email="owner@example.test",
        smtp_use_ssl=False,
        smtp_use_starttls=True,
    )
    server = FakeSMTP()
    monkeypatch.setattr(login_alerts, "get_settings", lambda: settings)
    monkeypatch.setattr(login_alerts.smtplib, "SMTP", lambda *args, **kwargs: server)

    login_alerts.send_login_alert(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36"
    )

    assert server.message is not None
    assert server.message["To"] == "owner@example.test"
    body = server.message.get_content()
    assert "Time (UTC):" in body
    assert "Browser category: Chrome" in body
    assert "Device category: desktop" in body
    assert "Windows NT" not in body
    assert "smtp-secret" not in body


def test_device_category_does_not_confuse_android_phone_and_tablet():
    assert login_alerts._device_category("Android Mobile") == "mobile"
    assert login_alerts._device_category("Android") == "tablet"
    assert login_alerts._device_category("iPad") == "tablet"
