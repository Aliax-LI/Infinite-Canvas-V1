import pytest

from backend.config import MIGRATIONS_DIR
from backend.repositories.sqlite.api_providers_repository import SqliteApiProvidersRepository
from backend.repositories.sqlite.conversation_repository import SqliteConversationRepository
from backend.repositories.sqlite.history_repository import SqliteHistoryRepository
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current


@pytest.fixture
def sqlite_db(tmp_path, monkeypatch):
    db_path = tmp_path / "infinite-canvas.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    return db_path


def test_sqlite_conversation_save_load(sqlite_db):
    repo = SqliteConversationRepository(sqlite_db)
    conv = {"id": "c1", "title": "Hi", "messages": [], "created_at": 1, "updated_at": 1}
    repo.save("user1", conv)
    loaded = repo.load("user1", "c1")
    assert loaded["title"] == "Hi"


def test_sqlite_history_append_and_save(sqlite_db):
    repo = SqliteHistoryRepository(sqlite_db)
    repo.append({"type": "zimage", "timestamp": 10.0, "images": ["/a.png"]})
    repo.append({"type": "zimage", "timestamp": 20.0, "images": ["/b.png"]})
    records = repo.load_all()
    assert len(records) == 2
    assert records[0]["timestamp"] == 20.0
    repo.save_all([{"type": "zimage", "timestamp": 30.0, "images": []}])
    assert len(repo.load_all()) == 1


def test_sqlite_api_providers_roundtrip(sqlite_db):
    repo = SqliteApiProvidersRepository(sqlite_db)
    providers = [{"id": "modelscope", "name": "MS", "enabled": True, "primary": True}]
    repo.save_all(providers)
    loaded = repo.load_all()
    assert loaded[0]["id"] == "modelscope"
    assert loaded[0]["primary"] is True


def test_cross_table_transaction_rollback(sqlite_db):
    ensure_schema_current(sqlite_db, MIGRATIONS_DIR)
    conn = connect(sqlite_db)
    try:
        with pytest.raises(RuntimeError):
            with transaction(conn):
                conn.execute(
                    "INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    ("p1", "P", 0, 1, 1),
                )
                conn.execute(
                    """
                    INSERT INTO canvases (id, project_id, document_json, created_at, updated_at, deleted_at)
                    VALUES (?, ?, ?, ?, ?, NULL)
                    """,
                    ("c1", "p1", "{}", 1, 1),
                )
                raise RuntimeError("rollback")
        project_count = conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        canvas_count = conn.execute("SELECT COUNT(*) FROM canvases").fetchone()[0]
        assert project_count == 0
        assert canvas_count == 0
    finally:
        conn.close()
