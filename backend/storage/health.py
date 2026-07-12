"""Database health probes for system API."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.storage.database import connect, integrity_check
from backend.storage.migration_runner import current_schema_version, discover_migrations


def database_health(db_path: Path) -> dict[str, Any]:
    if not db_path.is_file():
        return {
            "ok": False,
            "exists": False,
            "schema_version": 0,
            "target_schema_version": _target_schema_version(db_path.parent),
            "integrity": "missing",
            "path": str(db_path),
        }
    conn = connect(db_path, readonly=True)
    try:
        version = current_schema_version(conn)
        integrity = integrity_check(conn)
        return {
            "ok": integrity == "ok",
            "exists": True,
            "schema_version": version,
            "target_schema_version": _target_schema_version(db_path.parent),
            "integrity": integrity,
            "path": str(db_path),
        }
    finally:
        conn.close()


def _target_schema_version(_data_dir: Path) -> int:
    from backend.config import MIGRATIONS_DIR

    migrations = discover_migrations(MIGRATIONS_DIR)
    return migrations[-1].version if migrations else 0
