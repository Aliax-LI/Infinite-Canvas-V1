"""API contract baseline for /api/conversations — freeze response shape before SQLite migration."""


def test_list_conversations_response_shape(conversation_client):
    headers = {"X-User-ID": "contract-user"}
    response = conversation_client.get("/api/conversations", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "user_id" in body
    assert "conversations" in body
    assert isinstance(body["conversations"], list)


def test_create_conversation_response_shape(conversation_client):
    headers = {"X-User-ID": "contract-user"}
    response = conversation_client.post("/api/conversations", json={"title": "契约对话"}, headers=headers)
    assert response.status_code == 200
    conv = response.json()["conversation"]
    assert {"id", "title", "created_at", "updated_at", "messages"}.issubset(set(conv.keys()))


def test_get_conversation_response_shape(conversation_client):
    headers = {"X-User-ID": "contract-user"}
    created = conversation_client.post("/api/conversations", json={"title": "详情"}, headers=headers)
    conv_id = created.json()["conversation"]["id"]
    response = conversation_client.get(f"/api/conversations/{conv_id}", headers=headers)
    assert response.status_code == 200
    assert "conversation" in response.json()
