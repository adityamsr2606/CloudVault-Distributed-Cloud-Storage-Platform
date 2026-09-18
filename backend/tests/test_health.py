def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "CloudVault",
    }
    assert response.headers["x-request-id"]


def test_request_id_is_preserved(client):
    response = client.get("/health", headers={"x-request-id": "cloudvault-test-request"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "cloudvault-test-request"
