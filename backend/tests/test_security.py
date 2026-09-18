import jwt
import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_is_not_plaintext():
    password = "a-long-test-password"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed)


def test_access_and_refresh_tokens_are_not_interchangeable():
    access = create_access_token("user-1")
    refresh = create_refresh_token("user-1")

    assert decode_token(access, "access")["sub"] == "user-1"
    assert decode_token(refresh, "refresh")["sub"] == "user-1"

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(access, "refresh")
