"""SQLite connection management, transactions, health and backup helpers."""

from __future__ import annotations

import shutil
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DEFAULT_BUSY_TIMEOUT_MS = 30_000


def connect(db_path: Path, *, readonly: bool = False) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if readonly:
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=DEFAULT_BUSY_TIMEOUT_MS / 1000, isolation_level=None)
    else:
        conn = sqlite3.connect(str(db_path), timeout=DEFAULT_BUSY_TIMEOUT_MS / 1000, isolation_level=None)
    conn.row_factory = sqlite3.Row
    _configure_connection(conn)
    return conn


def _configure_connection(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute(f"PRAGMA busy_timeout = {DEFAULT_BUSY_TIMEOUT_MS}")


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def integrity_check(conn: sqlite3.Connection) -> str:
    row = conn.execute("PRAGMA integrity_check").fetchone()
    return str(row[0] if row else "error")


def wal_checkpoint(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")


def backup_database(source: Path, destination: Path) -> None:
    """Hot-backup SQLite file using the built-in backup API."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()
    src_conn = connect(source)
    try:
        wal_checkpoint(src_conn)
        dest_conn = connect(destination)
        try:
            src_conn.backup(dest_conn)
            wal_checkpoint(dest_conn)
        finally:
            dest_conn.close()
    finally:
        src_conn.close()


def copy_database_file(source: Path, destination: Path) -> None:
    """Filesystem copy after WAL checkpoint — fallback for tests."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    src_conn = connect(source)
    try:
        wal_checkpoint(src_conn)
    finally:
        src_conn.close()
    shutil.copy2(source, destination)
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{source}{suffix}")
        if sidecar.is_file():
            shutil.copy2(sidecar, Path(f"{destination}{suffix}"))
