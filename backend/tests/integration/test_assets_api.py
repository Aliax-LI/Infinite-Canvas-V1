import base64

from PIL import Image


def _write_png(path):
    img = Image.new("RGB", (4, 4), color=(0, 128, 255))
    img.save(path, format="PNG")


def test_asset_library_default(assets_client):
    response = assets_client.get("/api/asset-library")
    assert response.status_code == 200
    lib = response.json()["library"]
    assert lib["active_library_id"] == "default"
    assert isinstance(lib.get("categories"), list)
    assert any(c.get("id") == "characters" for c in lib["categories"])


def test_local_assets_upload_and_list(assets_client, tmp_path):
    png = tmp_path / "upload.png"
    _write_png(png)
    with open(png, "rb") as f:
        response = assets_client.post(
            "/api/local-assets/upload",
            files={"files": ("upload.png", f.read(), "image/png")},
            data={"folder": ""},
        )
    assert response.status_code == 200
    files = response.json()["files"]
    assert len(files) == 1
    rel = files[0]["file"]
    listing = assets_client.get("/api/local-assets").json()
    assert any(item["file"] == rel for item in listing["items"])
    assert listing["tree"]["count"] >= 1


def test_local_assets_folder_and_move(assets_client, tmp_path):
    png = tmp_path / "move.png"
    _write_png(png)
    with open(png, "rb") as f:
        up = assets_client.post(
            "/api/local-assets/upload",
            files={"files": ("move.png", f.read(), "image/png")},
        )
    rel = up.json()["files"][0]["file"]
    created = assets_client.post(
        "/api/local-assets/folders",
        json={"parent": "", "name": "shots"},
        headers={"Origin": "http://testserver"},
    )
    assert created.status_code == 200
    moved = assets_client.post(
        "/api/local-assets/move",
        json={"names": [rel], "folder": "shots"},
        headers={"Origin": "http://testserver"},
    )
    assert moved.status_code == 200
    assert moved.json()["moved"] == 1


def test_local_assets_caption_save(assets_client, tmp_path):
    png = tmp_path / "cap.png"
    _write_png(png)
    with open(png, "rb") as f:
        up = assets_client.post(
            "/api/local-assets/upload",
            files={"files": ("cap.png", f.read(), "image/png")},
        )
    rel = up.json()["files"][0]["file"]
    saved = assets_client.patch(
        "/api/local-assets/caption",
        json={"name": rel, "caption": "测试提示词"},
    )
    assert saved.status_code == 200
    assert saved.json()["caption"] == "测试提示词"
    item = next(i for i in assets_client.get("/api/local-assets").json()["items"] if i["file"] == rel)
    assert item.get("caption") == "测试提示词"


def test_local_assets_caption_mock(assets_client, tmp_path, monkeypatch):
    png = tmp_path / "ai_cap.png"
    _write_png(png)
    with open(png, "rb") as f:
        up = assets_client.post(
            "/api/local-assets/upload",
            files={"files": ("ai_cap.png", f.read(), "image/png")},
        )
    rel = up.json()["files"][0]["file"]

    async def fake_caption(abs_path, prompt, provider_id, model, ms_model=""):
        return "一只蓝色方块", "mock-model"

    monkeypatch.setattr("backend.services.local_assets_ai_service.caption_image_with_provider", fake_caption)
    response = assets_client.post(
        "/api/local-assets/caption",
        json={"names": [rel], "provider": "modelscope"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["caption"] == "一只蓝色方块"


def test_local_assets_classify_mock(assets_client, tmp_path, monkeypatch):
    png = tmp_path / "ai_cls.png"
    _write_png(png)
    with open(png, "rb") as f:
        up = assets_client.post(
            "/api/local-assets/upload",
            files={"files": ("ai_cls.png", f.read(), "image/png")},
        )
    rel = up.json()["files"][0]["file"]

    async def fake_classify(abs_path, provider_id="", model="", ms_model="", prompt=""):
        return {"summary": "测试图", "categories": {}, "tags": ["测试"], "flat": [], "model": "mock-model", "provider": "modelscope"}

    monkeypatch.setattr("backend.services.local_assets_ai_service.classify_image_with_provider", fake_classify)
    response = assets_client.post(
        "/api/local-assets/classify",
        json={"names": [rel], "provider": "modelscope"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["classification"]["summary"] == "测试图"


def test_import_local_image(assets_client, tmp_path):
    png = tmp_path / "local_ref.png"
    _write_png(png)
    response = assets_client.post(
        "/api/ai/import-local-image",
        json={"path": str(png.resolve())},
        headers={"Origin": "http://testserver"},
    )
    assert response.status_code == 200
    files = response.json()["files"]
    assert len(files) == 1
    assert files[0]["url"].startswith("/assets/input/")


def test_local_assets_caption_codex_mock(assets_client, tmp_path, monkeypatch):
    from backend.config import OUTPUT_INPUT_DIR
    from PIL import Image

    async def fake_chat(payload, history_messages=None):
        return "a blue square", {"text": "a blue square"}

    def fake_get_provider(provider_id="comfly"):
        return {"id": "codex", "name": "Codex", "protocol": "codex", "enabled": True, "chat_models": ["gpt-5.5"]}

    monkeypatch.setattr("backend.services.local_assets_ai_service.get_api_provider", fake_get_provider)
    monkeypatch.setattr("backend.services.codex_cli_service.codex_chat_text", fake_chat)
    png = OUTPUT_INPUT_DIR / "caption_codex.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color=(0, 0, 255)).save(png)
    with open(png, "rb") as f:
        uploaded = assets_client.post(
            "/api/local-assets/upload",
            files={"files": ("caption_codex.png", f.read(), "image/png")},
        )
    assert uploaded.status_code == 200
    rel = uploaded.json()["files"][0]["file"]
    response = assets_client.post(
        "/api/local-assets/caption",
        json={"names": [rel], "provider": "codex", "model": "gpt-5.5"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    caption = payload["items"][0]["caption"].lower()
    assert "blue" in caption or "square" in caption
