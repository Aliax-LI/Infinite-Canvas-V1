"""Versioned schema migrations for infinite-canvas.db."""

import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from backend.storage.database import connect, integrity_check, transaction

_MIGRATION_FILE_RE = re.compile(r"^(\d+)_(.+)\.sql$")


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path


def discover_migrations(migrations_dir: Path) -> list[Migration]:
    if not migrations_dir.is_dir():
        return []
    migrations: list[Migration] = []
    for path in sorted(migrations_dir.glob("*.sql")):
        match = _MIGRATION_FILE_RE.match(path.name)
        if not match:
            continue
        migrations.append(Migration(int(match.group(1)), match.group(2), path))
    migrations.sort(key=lambda item: item.version)
    return migrations


def current_schema_version(conn) -> int:
    try:
        row = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()
        return int(row[0] if row else 0)
    except sqlite3.OperationalError:
        return 0


def apply_migrations(db_path: Path, migrations_dir: Path) -> int:
    """Apply pending migrations. Returns number of migrations applied."""
    migrations = discover_migrations(migrations_dir)
    if not migrations:
        return 0
    conn = connect(db_path)
    try:
        applied = 0
        current = current_schema_version(conn)
        for migration in migrations:
            if migration.version <= current:
                continue
            script = migration.path.read_text(encoding="utf-8")
            conn.executescript(script)
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (migration.version, migration.name, int(time.time() * 1000)),
            )
            applied += 1
            current = migration.version
        if integrity_check(conn) != "ok":
            raise RuntimeError("PRAGMA integrity_check failed after migration")
        return applied
    finally:
        conn.close()


def ensure_schema_current(db_path: Path, migrations_dir: Path) -> int:
    """Idempotent startup hook — apply pending migrations if any."""
    return apply_migrations(db_path, migrations_dir)
