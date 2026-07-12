from __future__ import annotations

import time

from backend.config import DATABASE_PATH
from backend.repositories.protocols import SecretsRepository
from backend.repositories.sqlite._helpers import open_db, prepare_db
from backend.storage.database import transaction


class SqliteSecretsRepository(SecretsRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path
        prepare_db(self._db_path)

    def _conn(self):
        return open_db(self._db_path)

    def get(self, name: str) -> str | None:
        key = str(name or "").strip()
        if not key:
            return None
        conn = self._conn()
        try:
            row = conn.execute("SELECT value FROM app_secrets WHERE name = ?", (key,)).fetchone()
            return None if row is None else str(row["value"])
        finally:
            conn.close()

    def set_many(self, updates: dict[str, str]) -> None:
        if not updates:
            return
        now = int(time.time() * 1000)
        conn = self._conn()
        try:
            with transaction(conn):
                for raw_name, raw_value in updates.items():
                    name = str(raw_name or "").strip()
                    if not name:
                        continue
                    value = str(raw_value or "")
                    if value == "":
                        conn.execute("DELETE FROM app_secrets WHERE name = ?", (name,))
                    else:
                        conn.execute(
                            """
                            INSERT INTO app_secrets (name, value, updated_at)
                            VALUES (?, ?, ?)
                            ON CONFLICT(name) DO UPDATE SET
                                value = excluded.value,
                                updated_at = excluded.updated_at
                            """,
                            (name, value, now),
                        )
        finally:
            conn.close()

    def load_all(self) -> dict[str, str]:
        conn = self._conn()
        try:
            rows = conn.execute("SELECT name, value FROM app_secrets").fetchall()
            return {str(row["name"]): str(row["value"]) for row in rows}
        finally:
            conn.close()
