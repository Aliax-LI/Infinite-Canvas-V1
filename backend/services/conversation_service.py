import uuid

from backend.repositories import get_conversation_repository
from backend.repositories.json.conversation_repository import conversation_file_path
from backend.services.common import now_ms


def conversation_path(user_id: str, conversation_id: str):
    return conversation_file_path(user_id, conversation_id)


def save_conversation(user_id: str, conversation: dict) -> None:
    get_conversation_repository().save(user_id, conversation)


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
    return get_conversation_repository().load(user_id, conversation_id)


def list_conversations(user_id: str) -> list[dict]:
    return get_conversation_repository().list_for_user(user_id)


def delete_conversation(user_id: str, conversation_id: str) -> None:
    get_conversation_repository().delete(user_id, conversation_id)
