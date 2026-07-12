from __future__ import annotations

import json
import time
from typing import Any

from backend.config import DATABASE_PATH, MIGRATIONS_DIR
from backend.repositories.protocols import HistoryRepository
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current

_HISTORY_LIMIT = 5000


class SqliteHistoryRepository(HistoryRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path
        ensure_schema_current(self._db_path, MIGRATIONS_DIR)

    def _conn(self):
        return connect(self._db_path)

    def load_all(self) -> list[dict[str, Any]]:
        conn = self._conn()
        try:
            rows = conn.execute(
                "SELECT record_json FROM history_records ORDER BY timestamp DESC, id DESC"
            ).fetchall()
            records: list[dict[str, Any]] = []
            for row in rows:
                try:
                    item = json.loads(row["record_json"])
                    if isinstance(item, dict):
                        records.append(item)
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue
            return records
        finally:
            conn.close()

    def save_all(self, records: list[dict[str, Any]]) -> None:
        conn = self._conn()
        try:
            with transaction(conn):
                conn.execute("DELETE FROM history_records")
                for record in records:
                    if not isinstance(record, dict):
                        continue
                    item = dict(record)
                    ts = float(item.get("timestamp") or time.time())
                    conn.execute(
                        "INSERT INTO history_records (record_json, timestamp) VALUES (?, ?)",
                        (json.dumps(item, ensure_ascii=False), ts),
                    )
        finally:
            conn.close()

    def append(self, record: dict[str, Any]) -> None:
        item = dict(record)
        ts = float(item.setdefault("timestamp", time.time()))
        conn = self._conn()
        try:
            with transaction(conn):
                conn.execute(
                    "INSERT INTO history_records (record_json, timestamp) VALUES (?, ?)",
                    (json.dumps(item, ensure_ascii=False), ts),
                )
                excess = conn.execute("SELECT COUNT(*) FROM history_records").fetchone()[0] - _HISTORY_LIMIT
                if excess > 0:
                    conn.execute(
                        """
                        DELETE FROM history_records
                        WHERE id IN (
                            SELECT id FROM history_records
                            ORDER BY timestamp ASC, id ASC
                            LIMIT ?
                        )
                        """,
                        (excess,),
                    )
        finally:
            conn.close()
