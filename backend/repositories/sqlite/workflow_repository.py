from __future__ import annotations

import json
import os
import time
from typing import Any

from backend.config import DATABASE_PATH, WORKFLOW_DIR
from backend.repositories.protocols import WorkflowRepository
from backend.repositories.sqlite._helpers import CONFIG_SUFFIX, open_db
from backend.storage.database import transaction

CUSTOM_WORKFLOW_FOLDER = "custom"
LEGACY_CUSTOM_WORKFLOW_FOLDER = "自定义"


class SqliteWorkflowRepository(WorkflowRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path

    def _normalize_name(self, name: str) -> str:
        from backend.services.workflow_service import resolve_workflow_name

        rel = name if name.endswith(".json") else f"{name}.json"
        rel = resolve_workflow_name(rel)
        path = os.path.abspath(os.path.join(str(WORKFLOW_DIR), *rel.split("/")))
        workflow_root = os.path.abspath(str(WORKFLOW_DIR))
        if os.path.commonpath([workflow_root, path]) != workflow_root:
            raise ValueError("Invalid workflow path")
        rel_path = os.path.relpath(path, workflow_root).replace("\\", "/")
        if rel_path.endswith(".json"):
            rel_path = rel_path[:-5]
        return rel_path

    def _config_key(self, name: str) -> str:
        return f"{self._normalize_name(name)}{CONFIG_SUFFIX}"

    def workflow_exists(self, name: str) -> bool:
        key = self._normalize_name(name)
        conn = open_db(self._db_path)
        try:
            row = conn.execute(
                "SELECT 1 FROM workflow_files WHERE relative_path = ?",
                (key,),
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    def load_workflow(self, name: str) -> dict[str, Any]:
        key = self._normalize_name(name)
        conn = open_db(self._db_path)
        try:
            row = conn.execute(
                "SELECT document_json FROM workflow_files WHERE relative_path = ?",
                (key,),
            ).fetchone()
            if not row:
                raise FileNotFoundError(name)
            return json.loads(row["document_json"])
        finally:
            conn.close()

    def save_workflow(self, name: str, workflow: dict[str, Any]) -> None:
        key = self._normalize_name(name)
        conn = open_db(self._db_path)
        try:
            now = int(time.time() * 1000)
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO workflow_files (relative_path, document_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(relative_path) DO UPDATE SET
                        document_json = excluded.document_json,
                        updated_at = excluded.updated_at
                    """,
                    (key, json.dumps(workflow, ensure_ascii=False), now),
                )
        finally:
            conn.close()

    def load_config(self, name: str) -> dict[str, Any]:
        key = self._config_key(name)
        conn = open_db(self._db_path)
        try:
            row = conn.execute(
                "SELECT document_json FROM workflow_files WHERE relative_path = ?",
                (key,),
            ).fetchone()
            if not row:
                return {}
            data = json.loads(row["document_json"])
            return data if isinstance(data, dict) else {}
        finally:
            conn.close()

    def save_config(self, name: str, config: dict[str, Any]) -> None:
        key = self._config_key(name)
        conn = open_db(self._db_path)
        try:
            now = int(time.time() * 1000)
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO workflow_files (relative_path, document_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(relative_path) DO UPDATE SET
                        document_json = excluded.document_json,
                        updated_at = excluded.updated_at
                    """,
                    (key, json.dumps(config, ensure_ascii=False), now),
                )
        finally:
            conn.close()

    def delete_workflow(self, name: str) -> None:
        key = self._normalize_name(name)
        cfg_key = self._config_key(name)
        conn = open_db(self._db_path)
        try:
            with transaction(conn):
                conn.execute("DELETE FROM workflow_files WHERE relative_path IN (?, ?)", (key, cfg_key))
        finally:
            conn.close()

    def list_workflows(self) -> list[str]:
        conn = open_db(self._db_path)
        try:
            rows = conn.execute("SELECT relative_path FROM workflow_files ORDER BY relative_path").fetchall()
            names: list[str] = []
            for row in rows:
                path = str(row["relative_path"])
                if path.endswith(CONFIG_SUFFIX):
                    continue
                if not (path.startswith(f"{CUSTOM_WORKFLOW_FOLDER}/") or path.startswith(f"{LEGACY_CUSTOM_WORKFLOW_FOLDER}/")):
                    continue
                names.append(path)
            return sorted(names)
        finally:
            conn.close()
