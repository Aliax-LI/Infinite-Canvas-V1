import pytest

from backend.repositories import reset_repositories
from backend.repositories.json.conversation_repository import JsonConversationRepository


@pytest.fixture
def conversation_repo(tmp_path, monkeypatch):
    conv_dir = tmp_path / "conversations"
    monkeypatch.setattr("backend.config.CONVERSATION_DIR", conv_dir)
    monkeypatch.setattr("backend.repositories.json.conversation_repository.CONVERSATION_DIR", conv_dir)
    reset_repositories()
    yield JsonConversationRepository()
    reset_repositories()


def test_conversation_save_load(conversation_repo):
    conv = {"id": "c1", "title": "Hi", "messages": [], "created_at": 1, "updated_at": 1}
    conversation_repo.save("user1", conv)
    loaded = conversation_repo.load("user1", "c1")
    assert loaded["title"] == "Hi"


def test_conversation_service_uses_repository(tmp_path, monkeypatch):
    from backend.services import conversation_service

    conv_dir = tmp_path / "conversations"
    monkeypatch.setattr("backend.config.CONVERSATION_DIR", conv_dir)
    monkeypatch.setattr("backend.repositories.json.conversation_repository.CONVERSATION_DIR", conv_dir)
    reset_repositories()

    created = conversation_service.new_conversation("u1", "Test Chat")
    assert created["title"] == "Test Chat"
    listed = conversation_service.list_conversations("u1")
    assert any(item["id"] == created["id"] for item in listed)
    reset_repositories()
