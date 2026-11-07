import pytest

from app.auth.passwords import hash_password, verify_password


def test_password_can_be_verified():
    password = "a-strong-test-password-123"

    stored_hash = hash_password(password)

    assert verify_password(password, stored_hash)
    assert not verify_password("incorrect-password", stored_hash)


def test_same_password_uses_different_salts():
    password = "a-strong-test-password-123"

    first = hash_password(password)
    second = hash_password(password)

    assert first != second
    assert verify_password(password, first)
    assert verify_password(password, second)


def test_short_password_is_rejected():
    with pytest.raises(ValueError):
        hash_password("short")


def test_malformed_hash_is_rejected():
    assert not verify_password("password", "invalid")
