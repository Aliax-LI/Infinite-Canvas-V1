"""Integration smoke tests with STORAGE_BACKEND=sqlite."""

import pytest

from backend.repositories import reset_repositories


@pytest.fixture
def sqlite_client(client, tmp_path, monkeypatch):
    from backend.storage.migration_runner import ensure_schema_current
    from backend.config import MIGRATIONS_DIR

    db_path = tmp_path / "infinite-canvas.db"
    canvas_dir = tmp_path / "canvases"
    canvas_dir.mkdir()
    providers_path = tmp_path / "api_providers.json"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "sqlite")
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.canvas_repository.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.api_providers_repository.API_PROVIDERS_PATH", providers_path)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    reset_repositories()
    yield client
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "json")
    reset_repositories()


def test_sqlite_projects_api_contract(sqlite_client):
    response = sqlite_client.get("/api/projects")
    assert response.status_code == 200
    assert "projects" in response.json()


def test_sqlite_canvases_api_contract(sqlite_client):
    created = sqlite_client.post("/api/canvases", json={"title": "SQLite Canvas", "kind": "classic"})
    assert created.status_code == 200
    canvas_id = created.json()["canvas"]["id"]
    fetched = sqlite_client.get(f"/api/canvases/{canvas_id}")
    assert fetched.status_code == 200


def test_sqlite_storage_health(sqlite_client):
    response = sqlite_client.get("/api/storage-health")
    assert response.status_code == 200
    body = response.json()
    assert body["storage_backend"] == "sqlite"
    assert body["database"]["ok"] is True
    assert body["database"]["schema_version"] == 2
