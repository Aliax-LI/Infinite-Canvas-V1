from backend.config import DATABASE_PATH, MIGRATIONS_DIR
from backend.storage.health import database_health
from backend.storage.migration_runner import ensure_schema_current


def test_database_health_missing_file(tmp_path, monkeypatch):
    db_path = tmp_path / "missing.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    health = database_health(db_path)
    assert health["exists"] is False
    assert health["ok"] is False


def test_database_health_after_migration(tmp_path, monkeypatch):
    db_path = tmp_path / "infinite-canvas.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    health = database_health(db_path)
    assert health["exists"] is True
    assert health["ok"] is True
    assert health["schema_version"] == 2
    assert health["integrity"] == "ok"
