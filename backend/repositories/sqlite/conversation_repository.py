from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException

from backend.config import DATABASE_PATH, MIGRATIONS_DIR
from backend.repositories.protocols import ConversationRepository
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current


def _clean_conversation_id(conversation_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return cleaned


class SqliteConversationRepository(ConversationRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path
        ensure_schema_current(self._db_path, MIGRATIONS_DIR)

    def _conn(self):
        return connect(self._db_path)

    def load(self, user_id: str, conversation_id: str) -> dict[str, Any]:
        conversation_id = _clean_conversation_id(conversation_id)
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT document_json FROM conversations WHERE user_id = ? AND id = ?",
                (user_id, conversation_id),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="对话不存在")
            return json.loads(row["document_json"])
        finally:
            conn.close()

    def save(self, user_id: str, conversation: dict[str, Any]) -> None:
        conversation_id = _clean_conversation_id(str(conversation.get("id") or ""))
        title = str(conversation.get("title") or "新对话")
        created_at = int(conversation.get("created_at") or 0)
        updated_at = int(conversation.get("updated_at") or 0)
        payload = json.dumps(conversation, ensure_ascii=False)
        conn = self._conn()
        try:
            with transaction(conn):
                conn.execute(
                    """
                    INSERT INTO conversations (id, user_id, title, created_at, updated_at, document_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, id) DO UPDATE SET
                        title = excluded.title,
                        created_at = excluded.created_at,
                        updated_at = excluded.updated_at,
                        document_json = excluded.document_json
                    """,
                    (conversation_id, user_id, title, created_at, updated_at, payload),
                )
        finally:
            conn.close()

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        conn = self._conn()
        try:
            rows = conn.execute(
                "SELECT document_json FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
            records: list[dict[str, Any]] = []
            for row in rows:
                try:
                    data = json.loads(row["document_json"])
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue
                messages = data.get("messages", [])
                last_message = next((m for m in reversed(messages) if m.get("role") != "system"), None)
                records.append({
                    "id": data.get("id"),
                    "title": data.get("title", "新对话"),
                    "created_at": data.get("created_at", 0),
                    "updated_at": data.get("updated_at", 0),
                    "last_message": (last_message or {}).get("content", ""),
                })
            return records
        finally:
            conn.close()

    def delete(self, user_id: str, conversation_id: str) -> None:
        conversation_id = _clean_conversation_id(conversation_id)
        conn = self._conn()
        try:
            conn.execute(
                "DELETE FROM conversations WHERE user_id = ? AND id = ?",
                (user_id, conversation_id),
            )
        finally:
            conn.close()
