from __future__ import annotations

import json
import time
from typing import Any

from backend.config import DATABASE_PATH
from backend.repositories.protocols import SharedFoldersRepository
from backend.repositories.sqlite._helpers import ROOT_ROW_ID, load_root_document, open_db
from backend.storage.database import transaction


class SqliteSharedFoldersRepository(SharedFoldersRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path

    def load(self) -> dict[str, Any]:
        conn = open_db(self._db_path)
        try:
            return load_root_document(conn, "shared_folders", {"folders": []})
        finally:
            conn.close()

    def save(self, data: dict[str, Any]) -> None:
        conn = open_db(self._db_path)
        try:
            payload = json.dumps(data, ensure_ascii=False)
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO shared_folders (id, document_json, created_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json
                    """,
                    (ROOT_ROW_ID, payload, int(time.time() * 1000)),
                )
        finally:
            conn.close()
