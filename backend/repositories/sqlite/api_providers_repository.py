from __future__ import annotations

import json
from typing import Any

from backend.config import DATABASE_PATH, MIGRATIONS_DIR
from backend.repositories.protocols import ApiProvidersRepository
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current


class SqliteApiProvidersRepository(ApiProvidersRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path
        ensure_schema_current(self._db_path, MIGRATIONS_DIR)

    def _conn(self):
        return connect(self._db_path)

    def load_all(self) -> list[dict[str, Any]]:
        conn = self._conn()
        try:
            rows = conn.execute(
                "SELECT document_json FROM api_providers ORDER BY sort_order, id"
            ).fetchall()
            providers: list[dict[str, Any]] = []
            for row in rows:
                try:
                    item = json.loads(row["document_json"])
                    if isinstance(item, dict):
                        providers.append(item)
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue
            return providers
        finally:
            conn.close()

    def save_all(self, providers: list[dict[str, Any]]) -> None:
        conn = self._conn()
        try:
            with transaction(conn):
                conn.execute("DELETE FROM api_providers")
                for index, provider in enumerate(providers):
                    if not isinstance(provider, dict) or not provider.get("id"):
                        continue
                    conn.execute(
                        """
                        INSERT INTO api_providers (id, document_json, sort_order, enabled, is_primary)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            str(provider["id"]),
                            json.dumps(provider, ensure_ascii=False),
                            index,
                            1 if provider.get("enabled", True) else 0,
                            1 if provider.get("primary") else 0,
                        ),
                    )
        finally:
            conn.close()
