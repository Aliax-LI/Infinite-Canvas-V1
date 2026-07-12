import json

import pytest

from backend.storage.database import backup_database, connect, integrity_check, transaction
from backend.storage.migration_runner import apply_migrations, current_schema_version, ensure_schema_current


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


def test_connect_enables_wal_and_foreign_keys(db_path):
    conn = connect(db_path)
    try:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    finally:
        conn.close()


def test_transaction_rolls_back_on_error(db_path):
    conn = connect(db_path)
    try:
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")
        with pytest.raises(RuntimeError):
            with transaction(conn):
                conn.execute("INSERT INTO items (name) VALUES (?)", ("a",))
                raise RuntimeError("boom")
        count = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        assert count == 0
    finally:
        conn.close()


def test_migration_runner_applies_initial_schema(db_path):
    from backend.config import MIGRATIONS_DIR

    applied = apply_migrations(db_path, MIGRATIONS_DIR)
    assert applied >= 1
    conn = connect(db_path)
    try:
        assert current_schema_version(conn) >= 1
        assert integrity_check(conn) == "ok"
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        }
        assert "projects" in tables
        assert "canvases" in tables
        assert "app_secrets" in tables
    finally:
        conn.close()


def test_ensure_schema_current_is_idempotent(db_path):
    from backend.config import MIGRATIONS_DIR

    first = ensure_schema_current(db_path, MIGRATIONS_DIR)
    second = ensure_schema_current(db_path, MIGRATIONS_DIR)
    assert first >= 1
    assert second == 0


def test_backup_database(db_path):
    from backend.config import MIGRATIONS_DIR

    ensure_schema_current(db_path, MIGRATIONS_DIR)
    conn = connect(db_path)
    try:
        conn.execute(
            "INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ("p1", "Backup", 0, 1, 1),
        )
    finally:
        conn.close()
    backup_path = db_path.with_name("backup.db")
    backup_database(db_path, backup_path)
    backup_conn = connect(backup_path)
    try:
        row = backup_conn.execute("SELECT name FROM projects WHERE id = ?", ("p1",)).fetchone()
        assert row["name"] == "Backup"
        assert integrity_check(backup_conn) == "ok"
    finally:
        backup_conn.close()
