"""Shared helpers for SQLite repository implementations."""

from __future__ import annotations

import json
from typing import Any

from backend.config import DATABASE_PATH, MIGRATIONS_DIR
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current

ROOT_ROW_ID = "__root__"
CONFIG_SUFFIX = ".__config__"


def prepare_db(db_path=DATABASE_PATH) -> None:
    ensure_schema_current(db_path, MIGRATIONS_DIR)


def open_db(db_path=DATABASE_PATH):
    prepare_db(db_path)
    return connect(db_path)


def load_root_document(conn, table: str, default: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        f"SELECT document_json FROM {table} WHERE id = ?",
        (ROOT_ROW_ID,),
    ).fetchone()
    if not row:
        return default
    try:
        data = json.loads(row["document_json"])
        return data if isinstance(data, dict) else default
    except (json.JSONDecodeError, TypeError, ValueError):
        return default


def save_root_document(conn, table: str, data: dict[str, Any]) -> None:
    payload = json.dumps(data, ensure_ascii=False)
    with transaction(conn):
        conn.execute(
            f"""
            INSERT INTO {table} (id, document_json, created_at)
            VALUES (?, ?, CAST(strftime('%s','now') AS INTEGER) * 1000)
            ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json
            """,
            (ROOT_ROW_ID, payload),
        )
