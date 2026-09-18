def test_register_login_and_refresh(client):
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": "aditya@example.com",
            "password": "strong-password-123",
        },
    )
    assert register.status_code == 201
    assert register.json()["email"] == "aditya@example.com"

    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "aditya@example.com",
            "password": "strong-password-123",
        },
    )
    assert login.status_code == 200
    tokens = login.json()
    assert tokens["access_token"]
    assert tokens["refresh_token"]

    refreshed = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


def test_duplicate_email_is_rejected(client):
    payload = {
        "email": "user@example.com",
        "password": "strong-password-123",
    }
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert client.post("/api/v1/auth/register", json=payload).status_code == 409


def test_short_password_is_rejected(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "short"},
    )
    assert response.status_code == 422
