import json
import re
import uuid
from pathlib import Path
from threading import Lock

from fastapi import HTTPException

from backend.config import CONVERSATION_DIR
from backend.services.common import now_ms

CONVERSATION_LOCK = Lock()


def _user_dir(user_id: str) -> Path:
    path = CONVERSATION_DIR / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def conversation_path(user_id: str, conversation_id: str) -> Path:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return _user_dir(user_id) / f"{cleaned}.json"


def save_conversation(user_id: str, conversation: dict) -> None:
    with CONVERSATION_LOCK:
        path = conversation_path(user_id, conversation["id"])
        path.write_text(json.dumps(conversation, ensure_ascii=False, indent=2), encoding="utf-8")


def new_conversation(user_id: str, title: str = "新对话") -> dict:
    timestamp = now_ms()
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (title or "新对话")[:80],
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [],
    }
    save_conversation(user_id, conversation)
    return conversation


def load_conversation(user_id: str, conversation_id: str) -> dict:
    path = conversation_path(user_id, conversation_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="对话不存在")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def list_conversations(user_id: str) -> list[dict]:
    records: list[dict] = []
    user_path = _user_dir(user_id)
    for file_path in user_path.glob("*.json"):
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
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
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)


def delete_conversation(user_id: str, conversation_id: str) -> None:
    path = conversation_path(user_id, conversation_id)
    if path.is_file():
        path.unlink()
