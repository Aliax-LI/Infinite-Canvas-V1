from __future__ import annotations

import json
import os
import re
from typing import Any

from fastapi import HTTPException

from backend.config import CANVAS_DIR, ensure_data_dirs
from backend.repositories.protocols import CanvasRepository
from backend.services.common import CANVAS_LOCK, now_ms


def canvas_file_path(canvas_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", canvas_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    return os.path.join(CANVAS_DIR, f"{cleaned}.json")


class JsonCanvasRepository(CanvasRepository):
    def load(self, canvas_id: str) -> dict[str, Any]:
        return self.load_any(canvas_id)

    def load_any(self, canvas_id: str) -> dict[str, Any]:
        path = canvas_file_path(canvas_id)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="画布不存在")
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def save(self, canvas: dict[str, Any], *, touch_updated_at: bool = True) -> None:
        ensure_data_dirs()
        if touch_updated_at:
            canvas["updated_at"] = now_ms()
        with CANVAS_LOCK:
            with open(canvas_file_path(canvas["id"]), "w", encoding="utf-8") as f:
                json.dump(canvas, f, ensure_ascii=False, indent=2)

    def delete_file(self, canvas_id: str) -> None:
        path = canvas_file_path(canvas_id)
        if os.path.isfile(path):
            os.remove(path)

    def list_documents(self, *, include_deleted: bool = False) -> list[dict[str, Any]]:
        ensure_data_dirs()
        documents: list[dict[str, Any]] = []
        for filename in os.listdir(CANVAS_DIR):
            if not filename.endswith(".json"):
                continue
            try:
                with open(os.path.join(CANVAS_DIR, filename), encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError, ValueError, TypeError):
                continue
            is_deleted = bool(data.get("deleted_at"))
            if include_deleted != is_deleted:
                continue
            documents.append(data)
        return documents

    def cleanup_expired_trash(self, retention_ms: int) -> None:
        cutoff = now_ms() - retention_ms
        ensure_data_dirs()
        with CANVAS_LOCK:
            for filename in os.listdir(CANVAS_DIR):
                if not filename.endswith(".json"):
                    continue
                path = os.path.join(CANVAS_DIR, filename)
                try:
                    with open(path, encoding="utf-8") as f:
                        data = json.load(f)
                    deleted_at = int(data.get("deleted_at") or 0)
                    if deleted_at and deleted_at < cutoff:
                        os.remove(path)
                except (OSError, json.JSONDecodeError, ValueError, TypeError):
                    continue

    def reassign_project(self, from_project_id: str, to_project_id: str) -> int:
        ensure_data_dirs()
        moved = 0
        with CANVAS_LOCK:
            for filename in os.listdir(CANVAS_DIR):
                if not filename.endswith(".json"):
                    continue
                path = os.path.join(CANVAS_DIR, filename)
                try:
                    with open(path, encoding="utf-8") as f:
                        data = json.load(f)
                except (OSError, json.JSONDecodeError, ValueError, TypeError):
                    continue
                if str(data.get("project") or "") != from_project_id:
                    continue
                data["project"] = to_project_id
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                moved += 1
        return moved
