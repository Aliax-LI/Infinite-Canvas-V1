def test_prompt_libraries_default(prompt_library_client):
    response = prompt_library_client.get("/api/prompt-libraries")
    assert response.status_code == 200
    lib = response.json()["library"]
    assert lib["active_library_id"] == "system"
    assert any(item.get("id") == "system" for item in lib["libraries"])


def test_create_and_add_prompt(prompt_library_client):
    created = prompt_library_client.post("/api/prompt-libraries", json={"name": "我的库"}).json()
    lib_id = created["prompt_library"]["id"]
    added = prompt_library_client.post(
        "/api/prompt-libraries/items",
        json={"library_id": lib_id, "name": "测试", "positive": "一只猫", "category": "custom"},
    ).json()
    assert added["item"]["positive"] == "一只猫"
