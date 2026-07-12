import json

import pytest

from backend.config import DEFAULT_PROJECT_ID, MIGRATIONS_DIR
from backend.repositories.sqlite.project_repository import SqliteProjectRepository


@pytest.fixture
def sqlite_project_repo(tmp_path, monkeypatch):
    db_path = tmp_path / "infinite-canvas.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    yield SqliteProjectRepository(db_path)


def test_load_save_roundtrip(sqlite_project_repo):
    sqlite_project_repo.save_all([{"id": "p1", "name": "A", "order": 1, "created_at": 1, "updated_at": 1}])
    loaded = sqlite_project_repo.load_all()
    assert len(loaded) == 1
    assert loaded[0]["id"] == "p1"
    assert loaded[0]["name"] == "A"


def test_reassign_canvases(sqlite_project_repo):
    db_path = sqlite_project_repo._db_path
    conn = __import__("backend.storage.database", fromlist=["connect"]).connect(db_path)
    try:
        conn.execute(
            "INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ("old", "Old", 0, 1, 1),
        )
        conn.execute(
            "INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (DEFAULT_PROJECT_ID, "Default", 0, 1, 1),
        )
        conn.execute(
            """
            INSERT INTO canvases (id, project_id, document_json, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, NULL)
            """,
            ("c1", "old", json.dumps({"id": "c1", "project": "old", "title": "T"}), 1, 1),
        )
    finally:
        conn.close()
    moved = sqlite_project_repo.reassign_canvases("old", DEFAULT_PROJECT_ID)
    assert moved == 1
    conn = __import__("backend.storage.database", fromlist=["connect"]).connect(db_path)
    try:
        row = conn.execute("SELECT project_id FROM canvases WHERE id = ?", ("c1",)).fetchone()
        assert row["project_id"] == DEFAULT_PROJECT_ID
    finally:
        conn.close()
