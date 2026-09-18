import app.api.files as files_api


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def upload_bytes(self, object_key: str, data: bytes, content_type: str) -> None:
        self.objects[object_key] = data

    def download_bytes(self, object_key: str) -> bytes:
        return self.objects[object_key]

    def delete(self, object_key: str) -> None:
        self.objects.pop(object_key, None)


def auth_headers(client) -> dict[str, str]:
    payload = {"email": "user@example.com", "password": "strong-password-123"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    login = client.post("/api/v1/auth/login", json=payload)
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_auth_file_versioning_summary_and_restore(client, monkeypatch):
    storage = MemoryStorage()
    monkeypatch.setattr(files_api, "get_storage_service", lambda: storage)
    monkeypatch.setattr(files_api.index_file, "delay", lambda _file_id: None)
    headers = auth_headers(client)

    created = client.post(
        "/api/v1/files",
        headers=headers,
        files={"upload": ("notes.txt", b"first", "text/plain")},
    )
    assert created.status_code == 201
    file_id = created.json()["id"]
    assert created.json()["version_number"] == 1

    summary = client.get("/api/v1/files/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["file_count"] == 1
    assert summary.json()["used_bytes"] == 5

    replaced = client.put(
        f"/api/v1/files/{file_id}",
        headers=headers,
        files={"upload": ("notes.txt", b"second", "text/plain")},
    )
    assert replaced.status_code == 200
    assert replaced.json()["version_number"] == 2

    versions = client.get(f"/api/v1/files/{file_id}/versions", headers=headers)
    assert versions.status_code == 200
    assert [item["version_number"] for item in versions.json()] == [2, 1]

    downloaded = client.get(f"/api/v1/files/{file_id}/download", headers=headers)
    assert downloaded.content == b"second"

    assert client.delete(f"/api/v1/files/{file_id}", headers=headers).status_code == 204
    assert client.get("/api/v1/files", headers=headers).json() == []

    restored = client.post(f"/api/v1/files/{file_id}/restore", headers=headers)
    assert restored.status_code == 200
    assert len(client.get("/api/v1/files", headers=headers).json()) == 1
