from __future__ import annotations

import json
from typing import Any

from backend.config import DATABASE_PATH
from backend.repositories.protocols import RunningHubWorkflowRepository
from backend.repositories.sqlite._helpers import ROOT_ROW_ID, load_root_document, open_db
from backend.storage.database import transaction


class SqliteRunningHubWorkflowRepository(RunningHubWorkflowRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path

    def load(self) -> dict[str, Any]:
        conn = open_db(self._db_path)
        try:
            row = conn.execute(
                "SELECT document_json FROM runninghub_workflows WHERE id = ?",
                (ROOT_ROW_ID,),
            ).fetchone()
            if not row:
                return {}
            data = json.loads(row["document_json"])
            return data if isinstance(data, dict) else {}
        finally:
            conn.close()

    def save(self, store: dict[str, Any]) -> None:
        conn = open_db(self._db_path)
        try:
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO runninghub_workflows (id, document_json) VALUES (?, ?)
                    ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json
                    """,
                    (ROOT_ROW_ID, json.dumps(store, ensure_ascii=False)),
                )
        finally:
            conn.close()
