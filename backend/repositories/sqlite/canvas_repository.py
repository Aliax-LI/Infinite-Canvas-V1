from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException

from backend.config import DATABASE_PATH, MIGRATIONS_DIR
from backend.repositories.protocols import CanvasRepository
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current
from backend.services.common import now_ms


def _clean_canvas_id(canvas_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", canvas_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    return cleaned


def _deleted_at_value(canvas: dict[str, Any]) -> int | None:
    raw = canvas.get("deleted_at")
    if raw in (None, "", 0, False):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class SqliteCanvasRepository(CanvasRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path
        ensure_schema_current(self._db_path, MIGRATIONS_DIR)

    def _conn(self):
        return connect(self._db_path)

    def load(self, canvas_id: str) -> dict[str, Any]:
        return self.load_any(canvas_id)

    def load_any(self, canvas_id: str) -> dict[str, Any]:
        canvas_id = _clean_canvas_id(canvas_id)
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT document_json FROM canvases WHERE id = ?",
                (canvas_id,),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="画布不存在")
            return json.loads(row["document_json"])
        finally:
            conn.close()

    def save(self, canvas: dict[str, Any], *, touch_updated_at: bool = True) -> None:
        if touch_updated_at:
            canvas["updated_at"] = now_ms()
        canvas_id = _clean_canvas_id(str(canvas.get("id") or ""))
        canvas["id"] = canvas_id
        project_id = str(canvas.get("project") or "") or None
        created_at = int(canvas.get("created_at") or now_ms())
        updated_at = int(canvas.get("updated_at") or now_ms())
        deleted_at = _deleted_at_value(canvas)
        payload = json.dumps(canvas, ensure_ascii=False)
        conn = self._conn()
        try:
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO canvases (id, project_id, document_json, created_at, updated_at, deleted_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        project_id = excluded.project_id,
                        document_json = excluded.document_json,
                        updated_at = excluded.updated_at,
                        deleted_at = excluded.deleted_at
                    """,
                    (canvas_id, project_id, payload, created_at, updated_at, deleted_at),
                )
        finally:
            conn.close()

    def delete_file(self, canvas_id: str) -> None:
        canvas_id = _clean_canvas_id(canvas_id)
        conn = self._conn()
        try:
            conn.execute("DELETE FROM canvases WHERE id = ?", (canvas_id,))
        finally:
            conn.close()

    def list_documents(self, *, include_deleted: bool = False) -> list[dict[str, Any]]:
        conn = self._conn()
        try:
            if include_deleted:
                clause = "deleted_at IS NOT NULL AND deleted_at != 0"
            else:
                clause = "deleted_at IS NULL OR deleted_at = 0"
            rows = conn.execute(
                f"SELECT document_json FROM canvases WHERE {clause} ORDER BY updated_at DESC"
            ).fetchall()
            documents: list[dict[str, Any]] = []
            for row in rows:
                try:
                    documents.append(json.loads(row["document_json"]))
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue
            return documents
        finally:
            conn.close()

    def cleanup_expired_trash(self, retention_ms: int) -> None:
        cutoff = now_ms() - retention_ms
        conn = self._conn()
        try:
            conn.execute(
                "DELETE FROM canvases WHERE deleted_at IS NOT NULL AND deleted_at != 0 AND deleted_at < ?",
                (cutoff,),
            )
        finally:
            conn.close()

    def reassign_project(self, from_project_id: str, to_project_id: str) -> int:
        conn = self._conn()
        try:
            with transaction(conn):
                rows = conn.execute(
                    "SELECT id, document_json FROM canvases WHERE project_id = ?",
                    (from_project_id,),
                ).fetchall()
                moved = 0
                for row in rows:
                    try:
                        data = json.loads(row["document_json"])
                    except (json.JSONDecodeError, TypeError, ValueError):
                        continue
                    if str(data.get("project") or "") != from_project_id:
                        continue
                    data["project"] = to_project_id
                    conn.execute(
                        """
                        UPDATE canvases
                        SET project_id = ?, document_json = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            to_project_id,
                            json.dumps(data, ensure_ascii=False),
                            int(data.get("updated_at") or now_ms()),
                            row["id"],
                        ),
                    )
                    moved += 1
                return moved
        finally:
            conn.close()
