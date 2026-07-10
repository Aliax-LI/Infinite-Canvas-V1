from PIL import Image


def _write_png(path):
    img = Image.new("RGB", (6, 6), color=(10, 20, 30))
    img.save(path, format="PNG")


def _image_category(assets_client):
    lib = assets_client.get("/api/asset-library").json()["library"]
    return next(c for c in lib["categories"] if c.get("type") == "image")


def test_create_library_and_category(assets_client):
    created = assets_client.post("/api/asset-library/libraries", json={"name": "测试库"}).json()
    lib_id = created["asset_library"]["id"]
    cat = assets_client.post(
        "/api/asset-library/categories",
        json={"name": "角色参考", "library_id": lib_id},
    ).json()["category"]
    assert cat["name"] == "角色参考"
    assert cat.get("dir")


def test_add_rename_delete_item(assets_client, tmp_path):
    from backend.config import OUTPUT_INPUT_DIR

    png = OUTPUT_INPUT_DIR / "lib_src.png"
    _write_png(png)
    cat = _image_category(assets_client)
    added = assets_client.post(
        "/api/asset-library/items",
        json={"category_id": cat["id"], "url": "/assets/input/lib_src.png", "name": "源图"},
    ).json()
    item_id = added["item"]["id"]
    renamed = assets_client.patch(
        f"/api/asset-library/items/{item_id}",
        json={"name": "重命名图"},
    ).json()
    assert renamed["item"]["name"] == "重命名图"
    deleted = assets_client.delete(f"/api/asset-library/items/{item_id}").json()
    assert "library" in deleted


def test_move_item_between_categories(assets_client):
    from backend.config import OUTPUT_INPUT_DIR

    _write_png(OUTPUT_INPUT_DIR / "move_src.png")
    lib = assets_client.get("/api/asset-library").json()["library"]
    lib_id = lib["active_library_id"]
    cats = [c for c in lib["categories"] if c.get("type") == "image"]
    src_cat = cats[0]
    dst_cat = assets_client.post(
        "/api/asset-library/categories",
        json={"name": "目标分组", "library_id": lib_id},
    ).json()["category"]
    item_id = assets_client.post(
        "/api/asset-library/items",
        json={"category_id": src_cat["id"], "url": "/assets/input/move_src.png", "name": "移动图"},
    ).json()["item"]["id"]
    moved = assets_client.post(
        "/api/asset-library/items/move",
        json={
            "ids": [item_id],
            "library_id": lib_id,
            "target_library_id": lib_id,
            "target_category_id": dst_cat["id"],
        },
    ).json()
    assert moved["moved"] == 1


def test_classify_mock(assets_client, monkeypatch):
    async def fake_classify(abs_path, provider_id="", model="", ms_model="", prompt=""):
        return {"summary": "库内图", "categories": {}, "tags": [], "flat": [], "model": "mock-model", "provider": "modelscope"}

    monkeypatch.setattr("backend.services.local_assets_ai_service.classify_image_with_provider", fake_classify)
    lib = assets_client.get("/api/asset-library").json()["library"]
    item_id = lib["categories"][0]["items"][0]["id"] if lib["categories"][0].get("items") else None
    if not item_id:
        return
    response = assets_client.post(
        "/api/asset-library/items/classify",
        json={"ids": [item_id], "provider": "modelscope"},
    )
    assert response.status_code == 200


def test_register_avatar_apimart_mock(assets_client, monkeypatch):
    from backend.config import OUTPUT_INPUT_DIR
    from PIL import Image

    cat = next(c for c in assets_client.get("/api/asset-library").json()["library"]["categories"] if c.get("type") == "image")
    png = OUTPUT_INPUT_DIR / "avatar_src.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color=(1, 2, 3)).save(png)
    item = assets_client.post(
        "/api/asset-library/items",
        json={"category_id": cat["id"], "url": "/assets/input/avatar_src.png", "name": "人像"},
    ).json()["item"]

    async def fake_register(item_id, payload):
        return {"library": assets_client.get("/api/asset-library").json()["library"], "item": {**item, "registrations": {"apimart": {"task_id": "task-1", "status": "Processing"}}}}

    monkeypatch.setattr("backend.services.avatar_service.register_asset_library_avatar", fake_register)
    response = assets_client.post(
        f"/api/asset-library/items/{item['id']}/register-avatar",
        json={"provider_id": "apimart", "library_id": "default", "project_name": "default"},
    )
    assert response.status_code == 200
    assert response.json()["item"]["registrations"]["apimart"]["task_id"] == "task-1"


def test_avatar_status_apimart_mock(assets_client, monkeypatch):
    async def fake_check(item_id, payload):
        return {"library": assets_client.get("/api/asset-library").json()["library"], "item": {"id": item_id, "registrations": {"apimart": {"status": "Active", "asset_uri": "asset://abc"}}}}

    monkeypatch.setattr("backend.services.avatar_service.check_asset_library_avatar", fake_check)
    response = assets_client.post(
        "/api/asset-library/items/test-item/avatar-status",
        json={"provider_id": "apimart", "library_id": "default"},
    )
    assert response.status_code == 200
    assert response.json()["item"]["registrations"]["apimart"]["status"] == "Active"
