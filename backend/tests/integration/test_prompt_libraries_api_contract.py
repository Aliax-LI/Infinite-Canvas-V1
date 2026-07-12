"""API contract baseline for /api/prompt-libraries — freeze response shape before SQLite migration."""


def test_prompt_libraries_list_shape(prompt_library_client):
    response = prompt_library_client.get("/api/prompt-libraries")
    assert response.status_code == 200
    lib = response.json()["library"]
    assert "active_library_id" in lib
    assert "libraries" in lib
    assert isinstance(lib["libraries"], list)


def test_prompt_library_create_shape(prompt_library_client):
    response = prompt_library_client.post("/api/prompt-libraries", json={"name": "契约库"})
    assert response.status_code == 200
    item = response.json()["prompt_library"]
    assert {"id", "name", "type"}.issubset(set(item.keys()))
