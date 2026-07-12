from __future__ import annotations

import json
from typing import Any

from backend.config import DATABASE_PATH
from backend.repositories.protocols import AssetLibraryRepository
from backend.repositories.sqlite._helpers import open_db
from backend.storage.database import transaction


class SqliteAssetLibraryRepository(AssetLibraryRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path

    def load(self) -> dict[str, Any]:
        conn = open_db(self._db_path)
        try:
            row = conn.execute("SELECT document_json FROM asset_library WHERE id = 1").fetchone()
            if not row:
                return {"categories": [], "assets": []}
            data = json.loads(row["document_json"])
            return data if isinstance(data, dict) else {"categories": [], "assets": []}
        finally:
            conn.close()

    def save(self, library: dict[str, Any]) -> None:
        conn = open_db(self._db_path)
        try:
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO asset_library (id, document_json) VALUES (1, ?)
                    ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json
                    """,
                    (json.dumps(library, ensure_ascii=False),),
                )
        finally:
            conn.close()
