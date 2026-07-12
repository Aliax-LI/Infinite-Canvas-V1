from backend.services import chat_service


def test_conversation_crud_is_scoped_to_user(conversation_client):
    headers = {"X-User-ID": "chat-test-user"}
    created = conversation_client.post(
        "/api/conversations",
        json={"title": "迁移验证对话"},
        headers=headers,
    )
    assert created.status_code == 200
    conversation = created.json()["conversation"]

    listed = conversation_client.get("/api/conversations", headers=headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["conversations"]] == [conversation["id"]]

    detail = conversation_client.get(f"/api/conversations/{conversation['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["conversation"]["title"] == "迁移验证对话"

    deleted = conversation_client.delete(f"/api/conversations/{conversation['id']}", headers=headers)
    assert deleted.status_code == 200
    assert conversation_client.get("/api/conversations", headers=headers).json()["conversations"] == []


def test_chat_route_passes_the_request_to_the_migrated_service(conversation_client, monkeypatch):
    captured = {}

    async def fake_chat_endpoint(payload, user_id):
        captured["message"] = payload.message
        captured["size"] = payload.size
        captured["user_id"] = user_id
        return {"conversation": {"id": "chat-1", "messages": []}}

    monkeypatch.setattr(chat_service, "chat_endpoint", fake_chat_endpoint)
    response = conversation_client.post(
        "/api/chat",
        json={"message": "画一只猫", "mode": "image", "size": "1920x1080"},
        headers={"X-User-ID": "chat-test-user"},
    )

    assert response.status_code == 200
    assert captured == {
        "message": "画一只猫",
        "size": "1920x1080",
        "user_id": "chat-test-user",
    }
