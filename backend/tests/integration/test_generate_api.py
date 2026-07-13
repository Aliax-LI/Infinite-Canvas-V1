def test_image_params(client):
    response = client.get("/api/image-params?provider_id=modelscope")
    assert response.status_code == 200
    payload = response.json()
    assert payload["engine"] == "modelscope"
    assert payload["submit"] == "/api/canvas-image-tasks"
    assert payload["fields"]
    keys = {field["key"] for field in payload["fields"]}
    assert "size" in keys
    assert "n" in keys
    assert "reference_images" in keys


def test_canvas_llm_requires_key(client):
    response = client.post("/api/canvas-llm", json={"message": "hi"})
    assert response.status_code == 400


def test_canvas_llm_rejects_empty_message(client):
    response = client.post("/api/canvas-llm", json={"message": ""})
    assert response.status_code == 422


def test_canvas_llm_text_mock(client, monkeypatch):
    class FakeResponse:
        status_code = 200
        content = b"{\"choices\":[{\"message\":{\"content\":\"mock-reply\"}}]}"

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "mock-reply"}}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            return FakeResponse()

    monkeypatch.setattr("backend.services.chat_service.modelscope_api_key", lambda explicit_key="": "ms-test")
    monkeypatch.setattr("backend.services.chat_service.httpx.AsyncClient", lambda timeout: FakeClient())
    response = client.post("/api/canvas-llm", json={"message": "hi", "provider": "modelscope"})
    assert response.status_code == 200
    assert response.json()["text"] == "mock-reply"


def test_conversations_list(client):
    response = client.get("/api/conversations")
    assert response.status_code == 200
    payload = response.json()
    assert payload["conversations"] == []


def test_conversation_crud(conversation_client):
    created = conversation_client.post("/api/conversations", json={"title": "测试对话"}).json()["conversation"]
    listing = conversation_client.get("/api/conversations").json()["conversations"]
    assert any(item["id"] == created["id"] for item in listing)
    detail = conversation_client.get(f"/api/conversations/{created['id']}").json()["conversation"]
    assert detail["title"] == "测试对话"
    deleted = conversation_client.delete(f"/api/conversations/{created['id']}")
    assert deleted.status_code == 200


def test_history_and_queue(client, monkeypatch):
    monkeypatch.setattr(
        "backend.services.comfy_generate_service.comfy_generate",
        lambda payload: {"images": [], "error": "ComfyUI unavailable in test"},
    )
    assert client.get("/api/history").status_code == 200
    assert client.get("/api/queue_status?client_id=test").json() == {"total": 0, "position": 0}
    payload = client.post("/api/generate", json={"prompt": "test"}).json()
    assert payload.get("images") == []
    assert payload.get("error")


def test_ms_generate_requires_key(client):
    response = client.post("/api/ms/generate", json={"prompt": "a cat"})
    assert response.status_code == 400


def test_generate_cloud_requires_key(client):
    response = client.post("/generate", json={"prompt": "a cat", "resolution": "1024x1024"})
    assert response.status_code == 400
    assert "ModelScope" in response.json()["detail"]


def test_generate_cloud_zimage_mock(client, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", tmp_path / "history.json")
    monkeypatch.setattr("backend.services.ms_generate_service.MS_GENERATE_POLL_MAX", 2)
    monkeypatch.setattr("backend.services.ms_generate_service.MS_GENERATE_POLL_INTERVAL", 0)
    monkeypatch.setattr("backend.services.ms_generate_service.modelscope_api_key", lambda explicit_key="": "ms-test")

    posted = {}

    class FakeResponse:
        def __init__(self, status_code=200, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = text
            self.content = b"ok"

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, timeout=None):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            posted["url"] = url
            posted["json"] = json
            return FakeResponse(200, {"task_id": "zimage-task-1"})

        async def get(self, url, headers=None):
            return FakeResponse(200, {"task_status": "SUCCEED", "output_images": ["https://example.com/z.png"]})

    monkeypatch.setattr("backend.services.ms_generate_service.httpx.AsyncClient", FakeClient)

    async def fake_download(img_url, model):
        return "/assets/output/zimage_test.png"

    monkeypatch.setattr("backend.services.ms_generate_service.download_ms_image", fake_download)
    response = client.post(
        "/generate",
        json={"prompt": "一个女生", "resolution": "1024x1024"},
    )
    assert response.status_code == 200
    assert response.json()["url"] == "/assets/output/zimage_test.png"
    assert posted["json"]["model"] == "Tongyi-MAI/Z-Image-Turbo"
    assert posted["json"]["size"] == "1024x1024"


def test_ms_generate_mock(client, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", tmp_path / "history.json")
    monkeypatch.setattr("backend.services.angle_service.MS_GENERATE_POLL_MAX", 2)
    monkeypatch.setattr("backend.services.angle_service.MS_GENERATE_POLL_INTERVAL", 0)
    monkeypatch.setattr("backend.services.ms_generate_service.modelscope_api_key", lambda explicit_key="": "ms-test")

    class FakeResponse:
        def __init__(self, status_code=200, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = text
            self.content = b"ok"

        def json(self):
            return self._payload

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("err", request=None, response=self)

    class FakeClient:
        def __init__(self, timeout=None):
            self.timeout = timeout
            self.poll_count = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            return FakeResponse(200, {"task_id": "task-123"})

        async def get(self, url, headers=None):
            self.poll_count += 1
            if "tasks/" in url:
                return FakeResponse(200, {"task_status": "SUCCEED", "output_images": ["https://example.com/a.png"]})
            return FakeResponse(200, {"content": b"img"})

    import httpx

    monkeypatch.setattr("backend.services.ms_generate_service.httpx.AsyncClient", FakeClient)
    async def fake_download(img_url, model):
        return "/assets/output/ms_test.png"

    monkeypatch.setattr("backend.services.ms_generate_service.download_ms_image", fake_download)
    response = client.post("/api/ms/generate", json={"prompt": "a cat"})
    assert response.status_code == 200
    assert response.json()["task_id"] == "task-123"
    assert response.json()["url"] == "/assets/output/ms_test.png"


def test_history_reads_file(client, tmp_path, monkeypatch):
    from backend.repositories import reset_repositories

    history_file = tmp_path / "history.json"
    history_file.write_text(
        '[{"type": "zimage", "timestamp": 2, "images": ["/a.png"]}, {"type": "other", "timestamp": 3, "images": []}]',
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.config.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.repositories.json.history_repository.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", history_file)
    reset_repositories()
    payload = client.get("/api/history").json()
    assert len(payload) == 1
    assert payload[0]["images"] == ["/a.png"]


def test_history_delete(client, tmp_path, monkeypatch):
    from backend.repositories import reset_repositories

    history_file = tmp_path / "history.json"
    history_file.write_text(
        '[{"type": "zimage", "timestamp": 123.0, "images": []}, {"type": "zimage", "timestamp": 456.0, "images": ["/output/x.png"]}]',
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.config.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.repositories.json.history_repository.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", history_file)
    reset_repositories()
    result = client.post("/api/history/delete", json={"timestamp": 123.0}).json()
    assert result["success"] is True
    remaining = client.get("/api/history").json()
    assert len(remaining) == 1
    assert remaining[0]["timestamp"] == 456.0


def test_history_delete_batch(client, tmp_path, monkeypatch):
    from backend.repositories import reset_repositories

    history_file = tmp_path / "history.json"
    history_file.write_text(
        '[{"type": "online", "timestamp": 100.0, "images": ["/a.png"]}, '
        '{"type": "online", "timestamp": 200.0, "images": ["/b.png"]}, '
        '{"type": "online", "timestamp": 300.0, "images": ["/c.png"]}]',
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.config.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.repositories.json.history_repository.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", history_file)
    reset_repositories()
    result = client.post(
        "/api/history/delete-batch",
        json={"timestamps": [100.0, 300.0]},
    ).json()
    assert result["success"] is True
    assert result["deleted"] == 2
    remaining = client.get("/api/history").json()
    assert len(remaining) == 1
    assert remaining[0]["timestamp"] == 200.0


def test_history_purge_missing(client, tmp_path, monkeypatch):
    import json

    from backend.repositories import reset_repositories
    from backend.storage.object_store_factory import reset_object_store

    history_file = tmp_path / "history.json"
    objects_dir = tmp_path / "objects"
    output_dir = objects_dir / "output"
    output_dir.mkdir(parents=True)
    keep_name = "keep_real.png"
    (output_dir / keep_name).write_bytes(b"png")
    history_file.write_text(
        json.dumps(
            [
                {
                    "type": "online",
                    "timestamp": 1,
                    "prompt": "一只猫",
                    "images": ["/assets/output/jimeng_online.png"],
                },
                {
                    "type": "online",
                    "timestamp": 2,
                    "prompt": "real",
                    "images": [f"/assets/output/{keep_name}"],
                },
                {
                    "type": "zimage",
                    "timestamp": 3,
                    "prompt": "hello",
                    "images": ["/assets/output/mock.png"],
                },
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.config.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.repositories.json.history_repository.HISTORY_PATH", history_file)
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", history_file)
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)
    reset_object_store()
    reset_repositories()

    result = client.post("/api/history/purge-missing", json={"type": "online"}).json()
    assert result["success"] is True
    assert result["removed"] == 1
    online = client.get("/api/history?type=online").json()
    assert len(online) == 1
    assert online[0]["prompt"] == "real"
    # zimage mock left untouched when type filter is online
    all_items = client.get("/api/history").json()
    assert any(item.get("type") == "zimage" for item in all_items)

    result_all = client.post("/api/history/purge-missing", json={}).json()
    assert result_all["success"] is True
    assert result_all["removed"] == 1
    assert client.get("/api/history").json()[0]["prompt"] == "real"


def test_online_image_mock_does_not_pollute_project_history(client, monkeypatch):
    """Regression: online mocks must write only to isolated tmp history, not data/."""
    from pathlib import Path

    project_history = Path(__file__).resolve().parents[3] / "data" / "history.json"
    before = project_history.read_text(encoding="utf-8") if project_history.is_file() else None

    async def fake_jimeng(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "/assets/output/jimeng_online.png"}, {"submit_id": "task-jimeng"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/jimeng_online.png"

    monkeypatch.setattr("backend.services.jimeng_cli_service.generate_jimeng_provider_image", fake_jimeng)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    response = client.post(
        "/api/online-image",
        json={"prompt": "一只猫", "provider_id": "jimeng", "model": "jimeng-image-2k"},
    )
    assert response.status_code == 200
    after = project_history.read_text(encoding="utf-8") if project_history.is_file() else None
    assert after == before
    # Isolated tmp history should contain the mock append
    isolated = client.get("/api/history?type=online").json()
    assert len(isolated) >= 1
    assert isolated[0]["images"] == ["/assets/output/jimeng_online.png"]



def test_generate_mock_success(client, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", tmp_path / "history.json")
    monkeypatch.setattr("backend.services.comfy_generate_service.COMFYUI_HISTORY_TIMEOUT", 2)

    workflow_path = tmp_path / "Z-Image.json"
    workflow_path.write_text('{"23": {"inputs": {"text": ""}}, "144": {"inputs": {"width": 0, "height": 0}}}', encoding="utf-8")
    monkeypatch.setattr(
        "backend.services.comfy_generate_service.workflow_path_from_name",
        lambda name: str(workflow_path),
    )
    monkeypatch.setattr("backend.services.comfy_generate_service.reserve_best_backend", lambda required_images=None: "127.0.0.1:8188")
    monkeypatch.setattr("backend.services.comfy_generate_service.sync_required_images", lambda *args, **kwargs: None)

    class FakeHTTPResponse:
        def __init__(self, payload: bytes):
            self._payload = payload

        def read(self):
            return self._payload

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    prompt_id = "prompt-abc"
    history_payload = {
        prompt_id: {
            "outputs": {
                "9": {
                    "images": [{"filename": "out.png", "subfolder": "", "type": "output"}],
                }
            }
        }
    }

    def fake_urlopen(req, timeout=None):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if url.endswith("/prompt"):
            return FakeHTTPResponse(json.dumps({"prompt_id": prompt_id}).encode("utf-8"))
        if f"/history/{prompt_id}" in url:
            return FakeHTTPResponse(json.dumps(history_payload).encode("utf-8"))
        if "/view?" in url:
            return FakeHTTPResponse(b"pngbytes")
        raise urllib.error.URLError("unexpected")

    import json
    import urllib.error

    monkeypatch.setattr("backend.services.comfy_generate_service.urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(
        "backend.services.comfy_generate_service.download_comfy_output",
        lambda comfy_address, item, prefix="studio_": "/assets/output/mock.png",
    )

    response = client.post("/api/generate", json={"prompt": "hello", "workflow_json": "Z-Image.json"})
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("images") == ["/assets/output/mock.png"]
    assert payload.get("prompt_id") == prompt_id



def test_chat_requires_key(conversation_client):
    response = conversation_client.post("/api/chat", json={"message": "hello"})
    assert response.status_code == 400


def test_chat_image_mode_mock(conversation_client, monkeypatch):
    async def fake_generate(prompt, size, quality, model, reference_images=None, provider_id="comfly"):
        return ({"type": "url", "value": "https://example.com/chat.png"}, {"usage": {}})

    async def fake_save(image_data, prefix="chat_"):
        return "/assets/output/chat_test.png"

    monkeypatch.setattr("backend.services.online_image_service.generate_ai_image", fake_generate)
    monkeypatch.setattr("backend.services.jimeng_cli_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = conversation_client.post(
        "/api/chat",
        json={"message": "draw a cat", "mode": "image", "provider": "comfly"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["message"]["type"] == "image"
    assert payload["message"]["image_url"] == "/assets/output/chat_test.png"


def test_chat_text_mock(conversation_client, monkeypatch):
    monkeypatch.setattr("backend.services.chat_service.modelscope_api_key", lambda explicit_key="": "ms-test")

    class FakeResponse:
        status_code = 200
        content = b"{\"choices\":[{\"message\":{\"content\":\"chat-reply\"}}]}"

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "chat-reply"}}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            return FakeResponse()

    monkeypatch.setattr("backend.services.chat_service.httpx.AsyncClient", lambda timeout: FakeClient())
    response = conversation_client.post(
        "/api/chat",
        json={"message": "hello", "provider": "modelscope"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["message"]["content"] == "chat-reply"
    assert payload["conversation"]["messages"][-1]["content"] == "chat-reply"


def test_online_image_requires_key(client):
    response = client.post(
        "/api/online-image",
        json={"prompt": "a cat", "provider_id": "comfly", "model": "gpt-image-2"},
    )
    assert response.status_code == 400


def test_canvas_image_task_flow(client, monkeypatch):
    async def fake_build(payload):
        return {
            "prompt": payload.prompt,
            "images": ["/assets/output/online_test.png"],
            "image_items": [{"url": "/assets/output/online_test.png", "kind": "image"}],
            "timestamp": 1.0,
            "type": "online",
            "model": "gpt-image-2",
            "provider_id": payload.provider_id,
            "provider_name": "comfly",
            "task_id": None,
            "request_id": None,
            "params": {},
        }

    monkeypatch.setattr("backend.services.online_image_service.build_online_image_result", fake_build)
    created = client.post(
        "/api/canvas-image-tasks",
        json={"prompt": "a cat", "provider_id": "comfly", "model": "gpt-image-2"},
    )
    assert created.status_code == 200
    task_id = created.json()["task_id"]
    import time
    deadline = time.time() + 3
    status = "queued"
    while time.time() < deadline and status not in {"succeeded", "failed"}:
        task = client.get(f"/api/canvas-image-tasks/{task_id}").json()
        status = task.get("status")
        time.sleep(0.05)
    assert status == "succeeded"
    assert task["result"]["images"] == ["/assets/output/online_test.png"]


def test_get_canvas_image_task_missing(client):
    response = client.get("/api/canvas-image-tasks/missing-task")
    assert response.status_code == 404


def test_image_task_query_running(client, monkeypatch):
    async def fake_fetch(client, task_id, provider=None):
        return {"data": {"status": "RUNNING"}}

    monkeypatch.setattr("backend.services.online_image_service.fetch_image_task_payload", fake_fetch)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/image-task-query",
        json={"provider_id": "comfly", "task_id": "task-abc"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_canvas_comfy_task_flow(client, monkeypatch):
    def fake_comfy(req):
        return {"images": ["/assets/output/comfy_test.png"], "prompt": req.prompt, "type": req.type}

    monkeypatch.setattr("backend.services.comfy_generate_service.comfy_generate", fake_comfy)
    created = client.post(
        "/api/canvas-comfy-tasks",
        json={"prompt": "hello", "workflow_json": "Z-Image.json"},
    )
    assert created.status_code == 200
    task_id = created.json()["task_id"]
    import time
    deadline = time.time() + 3
    status = "queued"
    while time.time() < deadline and status not in {"succeeded", "failed"}:
        task = client.get(f"/api/canvas-comfy-tasks/{task_id}").json()
        status = task.get("status")
        time.sleep(0.05)
    assert status == "succeeded"
    assert task["result"]["images"] == ["/assets/output/comfy_test.png"]


def test_canvas_video_requires_key(client):
    response = client.post(
        "/api/canvas-video",
        json={"prompt": "a cat running", "provider_id": "comfly", "model": "veo3-fast"},
    )
    assert response.status_code == 400


def test_canvas_video_mock(client, monkeypatch):
    async def fake_canvas_video(payload):
        return {"videos": ["/assets/output/video_test.mp4"], "task_id": "task-v1", "raw": {"status": "completed"}}

    monkeypatch.setattr("backend.services.canvas_video_service.canvas_video", fake_canvas_video)
    response = client.post(
        "/api/canvas-video",
        json={"prompt": "a cat running", "provider_id": "comfly", "model": "veo3-fast"},
    )
    assert response.status_code == 200
    assert response.json()["videos"] == ["/assets/output/video_test.mp4"]


def test_temp_sh_upload_existing_url(client):
    response = client.post("/api/temp-sh/upload", json={"url": "https://example.com/video.mp4"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["url"] == "https://example.com/video.mp4"
    assert payload["service"] == "existing"


def test_cloud_video_upload_existing_url(client):
    response = client.post("/api/cloud-video/upload", json={"url": "https://cdn.example.com/a.mp4", "service": "auto"})
    assert response.status_code == 200
    assert response.json()["service"] == "existing"


def test_temp_sh_upload_missing_file(client):
    response = client.post("/api/temp-sh/upload", json={"url": "/assets/output/missing.mp4"})
    assert response.status_code == 404


def test_angle_generate_requires_key(client):
    response = client.post(
        "/api/angle/generate",
        json={"prompt": "rotate 45", "image_urls": ["https://example.com/a.png"]},
    )
    assert response.status_code == 400


def test_angle_poll_requires_key(client):
    response = client.post("/api/angle/poll_status", json={"task_id": "task-1"})
    assert response.status_code == 400


def test_angle_generate_mock(client, monkeypatch, tmp_path):
    monkeypatch.setattr("backend.services.history_service.HISTORY_FILE", tmp_path / "history.json")
    monkeypatch.setattr("backend.services.angle_service.MS_GENERATE_POLL_MAX", 2)
    monkeypatch.setattr("backend.services.angle_service.MS_GENERATE_POLL_INTERVAL", 0)
    monkeypatch.setattr("backend.services.angle_service.modelscope_api_key", lambda explicit_key="": "ms-test")

    class FakeResponse:
        def __init__(self, status_code=200, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = text

        def json(self):
            return self._payload

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("err", request=None, response=self)

    class FakeClient:
        def __init__(self, timeout=None):
            self.poll_count = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            return FakeResponse(200, {"task_id": "angle-task-1"})

        async def get(self, url, headers=None):
            self.poll_count += 1
            return FakeResponse(200, {"task_status": "SUCCEED", "output_images": ["https://example.com/out.png"]})

    import httpx

    monkeypatch.setattr("backend.services.angle_service.httpx.AsyncClient", FakeClient)
    async def fake_download(img_url, model):
        return "/assets/output/angle_test.png"

    monkeypatch.setattr("backend.services.angle_service.download_ms_image", fake_download)
    response = client.post(
        "/api/angle/generate",
        json={"prompt": "rotate", "image_urls": ["/assets/input/a.png"], "api_key": "test"},
    )
    assert response.status_code == 200
    assert response.json()["url"] == "/assets/output/angle_test.png"

def test_chat_agent_generate_mock(conversation_client, monkeypatch):
    async def fake_decide(payload, conversation, refs):
        return {"action": "generate_image", "prompt": "一只猫", "reply": ""}

    async def fake_generate(prompt, size, quality, model, reference_images=None, provider_id="comfly"):
        return ({"type": "url", "value": "https://example.com/agent.png"}, {"usage": {}})

    async def fake_save(image_data, prefix="chat_"):
        return "/assets/output/agent_test.png"

    monkeypatch.setattr("backend.services.chat_service.decide_chat_agent_action", fake_decide)
    monkeypatch.setattr("backend.services.online_image_service.generate_ai_image", fake_generate)
    monkeypatch.setattr("backend.services.jimeng_cli_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = conversation_client.post(
        "/api/chat/agent",
        json={"message": "生成一张猫的图片", "provider": "comfly"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["message"]["type"] == "image"
    assert payload["agent"]["action"] == "generate_image"


def test_chat_stream_rejects_image_mode(conversation_client):
    response = conversation_client.post(
        "/api/chat/stream",
        json={"message": "draw", "mode": "image"},
    )
    assert response.status_code == 400


def test_chat_stream_mock(conversation_client, monkeypatch):
    monkeypatch.setattr("backend.services.chat_service.modelscope_api_key", lambda explicit_key="": "ms-test")

    class FakeStreamResponse:
        status_code = 200

        async def aread(self):
            return b""

        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"流"}}]}'
            yield "data: [DONE]"

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    class FakeClient:
        def stream(self, method, url, headers=None, json=None):
            return FakeStreamResponse()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr("backend.services.chat_service.httpx.AsyncClient", lambda timeout: FakeClient())
    response = conversation_client.post(
        "/api/chat/stream",
        json={"message": "hello", "provider": "modelscope"},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    assert "流" in response.text

def test_canvas_llm_multimodal_mock(client, monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        content = b"{\"choices\":[{\"message\":{\"content\":\"seen-image\"}}]}"

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "seen-image"}}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr("backend.services.chat_service.modelscope_api_key", lambda explicit_key="": "ms-test")
    monkeypatch.setattr("backend.services.chat_service.httpx.AsyncClient", lambda timeout: FakeClient())
    monkeypatch.setattr(
        "backend.services.canvas_llm_media_service.media_reference_to_url",
        lambda value, max_image_size=None: "data:image/png;base64,abc" if value else "",
    )
    monkeypatch.setattr(
        "backend.services.canvas_llm_media_service.video_reference_to_frame_data_urls",
        lambda value, max_frames=6, max_size=768: [],
    )
    response = client.post(
        "/api/canvas-llm",
        json={
            "message": "describe this",
            "provider": "modelscope",
            "images": ["data:image/png;base64,abc"],
        },
    )
    assert response.status_code == 200
    assert response.json()["text"] == "seen-image"
    user_msg = captured["json"]["messages"][-1]
    assert isinstance(user_msg["content"], list)
    assert any(part.get("type") == "image_url" for part in user_msg["content"])



def test_online_image_jimeng_mock(client, monkeypatch):
    async def fake_jimeng(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "/assets/output/jimeng_online.png"}, {"submit_id": "task-jimeng"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/jimeng_online.png"

    monkeypatch.setattr("backend.services.jimeng_cli_service.generate_jimeng_provider_image", fake_jimeng)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    response = client.post(
        "/api/online-image",
        json={"prompt": "一只猫", "provider_id": "jimeng", "model": "jimeng-image-2k"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["images"] == ["/assets/output/jimeng_online.png"]
    assert payload["provider_id"] == "jimeng"


def test_online_image_n_returns_multiple_images(client, monkeypatch):
    """Regression: n=4 must return 4 URLs (backend gathers parallel generations)."""
    counter = {"i": 0}

    async def fake_generate(prompt, size, quality, model, reference_images=None, provider_id="comfly"):
        counter["i"] += 1
        idx = counter["i"]
        return (
            {"type": "url", "value": f"https://example.com/{idx}.png"},
            {"data": [{"url": f"https://example.com/{idx}.png"}]},
        )

    async def fake_save(image_data, prefix="online_"):
        value = (image_data or {}).get("value") or "x"
        name = value.rsplit("/", 1)[-1].replace(".png", "")
        return f"/assets/output/online_{name}.png"

    monkeypatch.setattr("backend.services.online_image_service.generate_ai_image", fake_generate)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/online-image",
        json={"prompt": "四只猫", "provider_id": "comfly", "model": "gpt-image-2", "n": 4},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["images"]) == 4
    assert payload["params"]["n"] == 4
    assert counter["i"] == 4


def test_online_image_volcengine_mock(client, monkeypatch):
    async def fake_volcengine(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "https://example.com/volc.png"}, {"id": "vol-task"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/volc_online.png"

    monkeypatch.setattr("backend.services.online_image_service.generate_volcengine_provider_image", fake_volcengine)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/online-image",
        json={"prompt": "一只猫", "provider_id": "volcengine", "model": "doubao-seedream"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["images"] == ["/assets/output/volc_online.png"]
    assert payload["provider_id"] == "volcengine"


def test_online_image_gemini_mock(client, monkeypatch):
    async def fake_gemini(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "https://example.com/gemini.png"}, {"id": "gemini-task"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/gemini_online.png"

    def fake_get_api_provider(provider_id="comfly"):
        return {
            "id": "google-gemini",
            "name": "Google Gemini",
            "base_url": "https://generativelanguage.googleapis.com",
            "protocol": "gemini",
            "enabled": True,
            "image_models": ["gemini-3-pro-image-preview"],
        }

    monkeypatch.setattr("backend.services.online_image_service.generate_gemini_provider_image", fake_gemini)
    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_api_provider)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/online-image",
        json={"prompt": "一只猫", "provider_id": "google-gemini", "model": "gemini-3-pro-image-preview"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["images"] == ["/assets/output/gemini_online.png"]
    assert payload["provider_id"] == "google-gemini"


def test_canvas_video_jimeng_mock(client, monkeypatch):
    async def fake_jimeng_video(payload, provider):
        return {"videos": ["/assets/output/jimeng_video_test.mp4"], "task_id": "jimeng-v1", "raw": {"submit_id": "jimeng-v1"}}

    monkeypatch.setattr("backend.services.jimeng_cli_service.generate_jimeng_video", fake_jimeng_video)
    response = client.post(
        "/api/canvas-video",
        json={"prompt": "a cat running", "provider_id": "jimeng", "model": "jimeng-video-720p"},
    )
    assert response.status_code == 200
    assert response.json()["videos"] == ["/assets/output/jimeng_video_test.mp4"]


def test_online_image_runninghub_mock(client, monkeypatch):
    async def fake_runninghub(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "https://example.com/rh.png"}, {"taskId": "rh-img-1"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/rh_online.png"

    monkeypatch.setattr("backend.services.runninghub_generate_service.generate_runninghub_provider_image", fake_runninghub)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/online-image",
        json={"prompt": "一只猫", "provider_id": "runninghub", "model": "rhart-image-g-2/text-to-image"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["images"] == ["/assets/output/rh_online.png"]
    assert payload["provider_id"] == "runninghub"


def test_canvas_video_runninghub_mock(client, monkeypatch):
    async def fake_runninghub_video(payload, provider):
        return {"videos": ["/assets/output/rh_video_test.mp4"], "task_id": "rh-v1", "raw": {"taskId": "rh-v1"}}

    monkeypatch.setattr("backend.services.runninghub_generate_service.generate_runninghub_video", fake_runninghub_video)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/canvas-video",
        json={"prompt": "a cat running", "provider_id": "runninghub", "model": "rhart-video-v3.1-fast/text-to-video"},
    )
    assert response.status_code == 200
    assert response.json()["videos"] == ["/assets/output/rh_video_test.mp4"]


def test_canvas_video_agnes_mock(client, monkeypatch):
    async def fake_agnes(client, payload, provider, base_url, requested_model):
        return {"videos": ["/assets/output/agnes_video.mp4"], "task_id": "agnes-v1", "raw": {"video_id": "agnes-v1"}}

    def fake_get_provider(provider_id="comfly"):
        return {
            "id": "agnes",
            "name": "Agnes",
            "base_url": "https://apihub.agnes-ai.com/v1",
            "protocol": "openai",
            "enabled": True,
            "video_models": ["agnes-video-v2.0"],
        }

    monkeypatch.setattr("backend.services.canvas_video_service.get_api_provider", fake_get_provider)
    monkeypatch.setattr("backend.services.canvas_video_service._generate_agnes_video", fake_agnes)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/canvas-video",
        json={"prompt": "a cat running", "provider_id": "agnes", "model": "agnes-video-v2.0"},
    )
    assert response.status_code == 200
    assert response.json()["videos"] == ["/assets/output/agnes_video.mp4"]


def test_online_image_codex_mock(client, monkeypatch):
    async def fake_codex(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "/assets/output/codex.png"}, {"provider": "codex"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/codex_online.png"

    def fake_get_provider(provider_id="comfly"):
        return {"id": "codex", "name": "Codex", "protocol": "codex", "enabled": True, "image_models": ["gpt-image-2"]}

    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_provider)
    monkeypatch.setattr("backend.services.codex_cli_service.generate_codex_provider_image", fake_codex)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    response = client.post("/api/online-image", json={"prompt": "一只猫", "provider_id": "codex", "model": "gpt-image-2"})
    assert response.status_code == 200
    assert response.json()["images"] == ["/assets/output/codex_online.png"]


def test_online_image_gemini_cli_mock(client, monkeypatch):
    async def fake_gemini(prompt, size, model, reference_images=None, provider=None):
        return ({"type": "url", "value": "/assets/output/gcli.png"}, {"provider": "gemini-cli"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/gcli_online.png"

    def fake_get_provider(provider_id="comfly"):
        return {"id": "gemini-cli", "name": "Gemini CLI", "protocol": "gemini-cli", "enabled": True, "image_models": ["auto"]}

    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_provider)
    monkeypatch.setattr("backend.services.gemini_cli_service.generate_gemini_cli_provider_image", fake_gemini)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    response = client.post("/api/online-image", json={"prompt": "一只猫", "provider_id": "gemini-cli", "model": "auto"})
    assert response.status_code == 200
    assert response.json()["images"] == ["/assets/output/gcli_online.png"]


def test_online_image_openai_edits_mock(client, monkeypatch, tmp_path):
    from backend.config import OUTPUT_INPUT_DIR

    captured = {}

    async def fake_openai(prompt, size, quality, model, reference_images=None, provider=None):
        captured["refs"] = reference_images
        return ({"type": "url", "value": "https://example.com/edited.png"}, {"mode": "edits"})

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/openai_edits.png"

    def fake_get_provider(provider_id="comfly"):
        return {
            "id": "comfly",
            "name": "Comfly",
            "base_url": "https://api.example.com",
            "protocol": "openai",
            "enabled": True,
            "image_models": ["gpt-image-2"],
        }

    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_provider)
    def fake_get_api_provider(provider_id="comfly"):
        return {"id": "comfly", "name": "Comfly", "base_url": "https://api.comfly.example/v1", "protocol": "openai", "enabled": True, "image_models": ["gpt-image-2"], "chat_models": []}

    monkeypatch.setattr("backend.services.openai_image_service.generate_openai_provider_image", fake_openai)
    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_api_provider)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    ref_path = OUTPUT_INPUT_DIR / "ref_edit.png"
    ref_path.parent.mkdir(parents=True, exist_ok=True)
    from PIL import Image
    Image.new("RGB", (8, 8), color=(255, 0, 0)).save(ref_path)
    response = client.post(
        "/api/online-image",
        json={
            "prompt": "改成蓝色",
            "provider_id": "comfly",
            "model": "gpt-image-2",
            "reference_images": [{"url": "/assets/input/ref_edit.png"}],
        },
    )
    assert response.status_code == 200
    assert captured.get("refs")
    assert response.json()["images"] == ["/assets/output/openai_edits.png"]


def test_online_image_modelscope_normalizes_local_reference_images(client, monkeypatch, tmp_path):
    from backend.config import OUTPUT_INPUT_DIR
    from PIL import Image

    captured: dict = {}

    class FakeResponse:
        status_code = 200

        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

        def raise_for_status(self):
            return None

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return FakeResponse({"task_id": "ms-task-1"})

        async def get(self, url, headers=None):
            return FakeResponse(
                {
                    "task_status": "SUCCEED",
                    "output_images": ["https://cdn.example.com/out.png"],
                }
            )

    ref_path = OUTPUT_INPUT_DIR / "ms_ref_edit.png"
    ref_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color=(0, 0, 255)).save(ref_path)

    async def fake_save(image_data, prefix="online_"):
        return "/assets/output/ms_edit.png"

    def fake_get_provider(provider_id="modelscope"):
        return {
            "id": "modelscope",
            "name": "ModelScope",
            "base_url": "https://api.modelscope.cn",
            "protocol": "modelscope",
            "enabled": True,
            "image_models": ["Tongyi-MAI/Z-Image-Turbo"],
        }

    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_provider)
    monkeypatch.setattr("backend.services.online_image_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.online_image_service.modelscope_api_key", lambda explicit_key="": "ms-test")
    monkeypatch.setattr("backend.services.online_image_service.modelscope_image_api_root", lambda: "https://api.modelscope.cn/v1")
    monkeypatch.setattr("backend.services.online_image_service.httpx.AsyncClient", FakeAsyncClient)

    response = client.post(
        "/api/online-image",
        json={
            "prompt": "改成红色",
            "provider_id": "modelscope",
            "model": "Tongyi-MAI/Z-Image-Turbo",
            "reference_images": [{"url": "/assets/input/ms_ref_edit.png"}],
        },
    )
    assert response.status_code == 200
    image_urls = captured["payload"]["image_url"]
    assert len(image_urls) == 1
    assert image_urls[0].startswith("data:image/")
    assert ";base64," in image_urls[0]
    assert response.json()["images"] == ["/assets/output/ms_edit.png"]


def test_online_image_friendly_error_on_400(client, monkeypatch):
    import httpx

    class FakeResponse:
        status_code = 400
        text = '{"error":{"message":"invalid size for gpt-image-2"}}'

        def json(self):
            return {"error": {"message": self.text}}

    class FakeHTTPStatusError(httpx.HTTPStatusError):
        pass

    async def fake_openai(*args, **kwargs):
        req = httpx.Request("POST", "https://example.com/v1/images/generations")
        resp = FakeResponse()
        raise httpx.HTTPStatusError("bad", request=req, response=resp)

    def fake_get_provider(provider_id="comfly"):
        return {
            "id": "comfly",
            "name": "Comfly",
            "base_url": "https://api.example.com",
            "protocol": "openai",
            "enabled": True,
            "image_models": ["gpt-image-2"],
        }

    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_provider)
    def fake_get_api_provider(provider_id="comfly"):
        return {"id": "comfly", "name": "Comfly", "base_url": "https://api.comfly.example/v1", "protocol": "openai", "enabled": True, "image_models": ["gpt-image-2"], "chat_models": []}

    monkeypatch.setattr("backend.services.openai_image_service.generate_openai_provider_image", fake_openai)
    monkeypatch.setattr("backend.services.online_image_service.get_api_provider", fake_get_api_provider)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")
    response = client.post(
        "/api/online-image",
        json={"prompt": "test", "provider_id": "comfly", "model": "gpt-image-2", "size": "4096x4096"},
    )
    assert response.status_code == 400
    assert "GPT-Image-2" in response.json()["detail"] or "尺寸" in response.json()["detail"]


def test_canvas_llm_codex_mock(client, monkeypatch):
    async def fake_chat(payload, history_messages=None):
        return "codex canvas reply", {"text": "codex canvas reply"}

    monkeypatch.setattr("backend.services.codex_cli_service.codex_chat_text", fake_chat)
    response = client.post("/api/canvas-llm", json={"message": "hello", "provider": "codex", "model": "gpt-5.5"})
    assert response.status_code == 200
    assert response.json()["text"] == "codex canvas reply"


def test_chat_stream_codex_mock(conversation_client, monkeypatch):
    async def fake_chat(payload, history_messages=None):
        return "codex stream", {"text": "codex stream"}

    monkeypatch.setattr("backend.services.codex_cli_service.codex_chat_text", fake_chat)
    response = conversation_client.post("/api/chat/stream", json={"message": "hello", "provider": "codex"})
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    assert "codex stream" in response.text


def test_chat_codex_mock(conversation_client, monkeypatch):
    async def fake_chat(payload, history_messages=None):
        return "codex chat reply", {"text": "codex chat reply"}

    monkeypatch.setattr("backend.services.codex_cli_service.codex_chat_text", fake_chat)
    response = conversation_client.post("/api/chat", json={"message": "hello", "provider": "codex"})
    assert response.status_code == 200
    assert response.json()["message"]["content"] == "codex chat reply"


def test_canvas_llm_gemini_cli_mock(client, monkeypatch):
    async def fake_chat(payload, history_messages=None):
        return "gemini canvas", {"text": "gemini canvas"}

    def fake_get_api_provider(provider_id="comfly"):
        return {"id": "gemini-cli", "name": "Antigravity", "protocol": "gemini-cli", "enabled": True, "chat_models": ["auto"]}

    monkeypatch.setattr("backend.services.chat_service.get_api_provider", fake_get_api_provider)
    monkeypatch.setattr("backend.services.gemini_cli_service.gemini_cli_chat_text", fake_chat)
    response = client.post("/api/canvas-llm", json={"message": "hello", "provider": "gemini-cli"})
    assert response.status_code == 200
    assert response.json()["text"] == "gemini canvas"


def test_chat_stream_gemini_cli_mock(conversation_client, monkeypatch):
    async def fake_chat(payload, history_messages=None):
        return "gemini stream", {"text": "gemini stream"}

    def fake_get_api_provider(provider_id="comfly"):
        return {"id": "gemini-cli", "name": "Antigravity", "protocol": "gemini-cli", "enabled": True, "chat_models": ["auto"]}

    monkeypatch.setattr("backend.services.chat_service.get_api_provider", fake_get_api_provider)
    monkeypatch.setattr("backend.services.gemini_cli_service.gemini_cli_chat_text", fake_chat)
    response = conversation_client.post("/api/chat/stream", json={"message": "hello", "provider": "gemini-cli"})
    assert response.status_code == 200
    assert "gemini stream" in response.text


def test_canvas_video_agnes_mock(client, monkeypatch):
    async def fake_agnes(client_obj, payload, provider, base_url, requested_model):
        return {"videos": ["/assets/output/agnes.mp4"], "task_id": "agnes-1", "raw": {}}

    monkeypatch.setattr("backend.services.canvas_video_advanced_service.generate_agnes_video", fake_agnes)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")

    def fake_get_api_provider(provider_id="comfly"):
        return {"id": "agnes", "name": "Agnes", "base_url": "https://apihub.agnes-ai.com/v1", "protocol": "openai", "enabled": True, "video_models": ["agnes-video-v2.0"]}

    monkeypatch.setattr("backend.services.canvas_video_service.get_api_provider", fake_get_api_provider)
    response = client.post(
        "/api/canvas-video",
        json={"prompt": "ocean waves", "provider_id": "agnes", "model": "agnes-video-v2.0"},
    )
    assert response.status_code == 200
    assert response.json()["videos"] == ["/assets/output/agnes.mp4"]


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


def test_effective_image_request_mode_agnes():
    from backend.services.openai_image_service import effective_image_request_mode

    provider = {"base_url": "https://apihub.agnes-ai.com/v1", "image_request_mode": "openai"}
    assert effective_image_request_mode(provider, "agnes-image-v1") == "openai-json"
