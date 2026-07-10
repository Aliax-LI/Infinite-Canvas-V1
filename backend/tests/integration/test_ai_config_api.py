def test_ai_config_shape(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    payload = response.json()
    assert {"base_url", "chat_models", "image_models", "api_providers"}.issubset(payload.keys())


def test_ai_models_shape(client):
    response = client.get("/api/models")
    assert response.status_code == 200
    payload = response.json()
    assert {"chat_models", "image_models", "video_models"}.issubset(payload.keys())


def test_config_token(client):
    response = client.get("/api/config/token")
    assert response.status_code == 200
    assert "token" in response.json()
