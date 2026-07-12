import json


def test_list_providers_default(providers_client):
    response = providers_client.get("/api/providers")
    assert response.status_code == 200
    providers = response.json()["providers"]
    assert any(p["id"] == "modelscope" for p in providers)
    assert any(p["id"] == "volcengine" for p in providers)
    assert all("has_key" in p for p in providers)


def test_save_providers(providers_client):
    payload = [
        {
            "id": "modelscope",
            "name": "ModelScope",
            "base_url": "https://api-inference.modelscope.cn/v1",
            "protocol": "openai",
            "enabled": True,
            "primary": True,
            "image_models": ["flux"],
            "chat_models": ["qwen"],
            "video_models": [],
        },
        {
            "id": "runninghub",
            "name": "RunningHub",
            "base_url": "https://www.runninghub.cn",
            "protocol": "runninghub",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
            "api_key": "test-rh-key",
        },
    ]
    saved = providers_client.put("/api/providers", json=payload)
    assert saved.status_code == 200
    providers = saved.json()["providers"]
    ms = next(p for p in providers if p["id"] == "modelscope")
    assert ms["primary"] is True
    assert ms["image_models"] == ["flux"]
    rh = next(p for p in providers if p["id"] == "runninghub")
    assert rh["has_key"] is True


def test_save_provider_api_key_persists_in_secrets_store(providers_client, tmp_path, monkeypatch):
    secrets_path = tmp_path / "app_secrets.json"
    env_file = tmp_path / "API" / ".env"
    env_file.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("backend.config.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.config.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.env_helper.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.secrets_service.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.repositories.json.secrets_repository.APP_SECRETS_PATH", secrets_path)
    monkeypatch.delenv("MODELSCOPE_API_KEY", raising=False)
    from backend.repositories import reset_repositories

    reset_repositories()

    payload = [
        {
            "id": "modelscope",
            "name": "ModelScope",
            "base_url": "https://api-inference.modelscope.cn/v1",
            "protocol": "openai",
            "enabled": True,
            "primary": True,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
            "api_key": "stored-ms-key",
        },
        {
            "id": "runninghub",
            "name": "RunningHub",
            "base_url": "https://www.runninghub.cn",
            "protocol": "runninghub",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
        },
        {
            "id": "volcengine",
            "name": "火山引擎",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "protocol": "volcengine",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
        },
    ]
    saved = providers_client.put("/api/providers", json=payload)
    assert saved.status_code == 200
    assert secrets_path.is_file()
    secrets = json.loads(secrets_path.read_text(encoding="utf-8"))
    assert secrets.get("MODELSCOPE_API_KEY") == "stored-ms-key"
    # Secrets must not be written back to api.env
    if env_file.is_file():
        assert "MODELSCOPE_API_KEY" not in env_file.read_text(encoding="utf-8")

    monkeypatch.delenv("MODELSCOPE_API_KEY", raising=False)
    reset_repositories()
    listed = providers_client.get("/api/providers")
    ms = next(p for p in listed.json()["providers"] if p["id"] == "modelscope")
    assert ms["has_key"] is True
    assert "stored-ms-key" not in json.dumps(listed.json())


def test_save_providers_ms_loras(providers_client):
    payload = [
        {
            "id": "modelscope",
            "name": "ModelScope",
            "base_url": "https://api-inference.modelscope.cn/v1",
            "protocol": "openai",
            "enabled": True,
            "primary": True,
            "image_models": ["Tongyi-MAI/Z-Image-Turbo"],
            "chat_models": [],
            "video_models": [],
            "ms_loras": [
                {
                    "id": "Daniel8152/film",
                    "target_model": "Tongyi-MAI/Z-Image-Turbo",
                    "strength": 0.8,
                    "enabled": True,
                }
            ],
        },
        {
            "id": "runninghub",
            "name": "RunningHub",
            "base_url": "https://www.runninghub.cn",
            "protocol": "runninghub",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
        },
    ]
    saved = providers_client.put("/api/providers", json=payload)
    assert saved.status_code == 200
    ms = next(p for p in saved.json()["providers"] if p["id"] == "modelscope")
    assert ms["ms_loras"][0]["id"] == "Daniel8152/film"
    assert ms["ms_loras"][0]["target_model"] == "Tongyi-MAI/Z-Image-Turbo"

    listed = providers_client.get("/api/providers")
    assert listed.status_code == 200
    ms_listed = next(p for p in listed.json()["providers"] if p["id"] == "modelscope")
    assert ms_listed["ms_loras"][0]["strength"] == 0.8


def test_fetch_models_requires_key(providers_client):
    response = providers_client.get("/api/providers/modelscope/fetch-models")
    assert response.status_code == 400


def test_fetch_models_runninghub_fallback(providers_client):
    response = providers_client.get("/api/providers/runninghub/fetch-models")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("image_models")
    assert payload.get("protocol") == "runninghub" or "image_models" in payload


def test_codex_test_connection(client):
    response = client.post(
        "/api/providers/test-connection",
        json={"provider_id": "codex", "protocol": "codex"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "image_models" in payload
    assert payload.get("protocol") == "codex"


def test_probe_async_codex(client):
    response = client.post("/api/providers/probe-async", json={"provider_id": "codex", "protocol": "codex"})
    assert response.status_code == 200
    assert response.json().get("protocol") == "codex"


def test_fetch_models_from_payload_codex(client):
    response = client.post("/api/providers/fetch-models", json={"provider_id": "codex", "protocol": "codex"})
    assert response.status_code == 200
    assert "image_models" in response.json()


def test_openai_probe_requires_key(providers_client):
    response = providers_client.post(
        "/api/providers/test-connection",
        json={"base_url": "https://api.openai.com/v1", "protocol": "openai"},
    )
    assert response.status_code == 400


def test_provider_test_connection_volcengine_mock(providers_client, monkeypatch):
    async def mock_probe(*args, **kwargs):
        return {
            "ok": True,
            "protocol": "volcengine",
            "status": 200,
            "model_count": 2,
            "image_models": [],
            "chat_models": [],
            "video_models": ["doubao-seedance"],
            "all": ["doubao-seedance", "doubao-pro"],
            "message": "上游模型列表可用，找到 2 个模型",
        }

    monkeypatch.setattr("backend.services.upstream_probe_service.probe_http_models", mock_probe)
    response = providers_client.post(
        "/api/providers/test-connection",
        json={
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "protocol": "volcengine",
            "api_key": "test-volc-key",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("ok") is True
    assert payload.get("protocol") == "volcengine"
    assert payload.get("video_models") == ["doubao-seedance"]


def test_fetch_models_volcengine_mock(providers_client, monkeypatch):
    async def mock_probe(*args, **kwargs):
        return {
            "ok": True,
            "protocol": "volcengine",
            "status": 200,
            "model_count": 1,
            "image_models": [],
            "chat_models": [],
            "video_models": ["doubao-seedance"],
            "all": ["doubao-seedance"],
            "message": "方舟任务接口可用",
        }

    monkeypatch.setattr("backend.services.upstream_probe_service.probe_http_models", mock_probe)
    providers_client.put(
        "/api/providers",
        json=[
            {
                "id": "volcengine",
                "name": "Volcengine",
                "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                "protocol": "volcengine",
                "enabled": True,
                "primary": False,
                "image_models": [],
                "chat_models": [],
                "video_models": [],
                "api_key": "test-volc-key",
            }
        ],
    )
    response = providers_client.get("/api/providers/volcengine/fetch-models")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("video_models") == ["doubao-seedance"]
    assert payload.get("protocol") == "volcengine"


def test_fetch_models_modelscope_returns_upstream_only(providers_client, monkeypatch):
    async def mock_probe(base_url, api_key, protocol="openai"):
        return {
            "ok": True,
            "status": 200,
            "model_count": 2,
            "image_models": [],
            "chat_models": ["Qwen/Qwen3-235B-A22B", "MiniMax/MiniMax-M2.7:MiniMax"],
            "video_models": [],
            "all": ["Qwen/Qwen3-235B-A22B", "MiniMax/MiniMax-M2.7:MiniMax"],
            "message": "上游模型列表可用，找到 2 个模型",
        }

    monkeypatch.setattr("backend.services.provider_probe_service.probe_openai_compatible_models", mock_probe)

    async def mock_enrich(result, **kwargs):
        from backend.services.modelscope_dolphin_service import merge_modelscope_fetch_result

        return merge_modelscope_fetch_result(result, ["Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image-2512"])

    monkeypatch.setattr("backend.services.modelscope_dolphin_service.enrich_modelscope_fetch_result", mock_enrich)
    providers_client.put(
        "/api/providers",
        json=[
            {
                "id": "modelscope",
                "name": "ModelScope",
                "base_url": "https://api-inference.modelscope.cn/v1",
                "protocol": "openai",
                "enabled": True,
                "primary": True,
                "image_models": [],
                "chat_models": [],
                "video_models": [],
                "api_key": "test-ms-key",
            },
            {
                "id": "runninghub",
                "name": "RunningHub",
                "base_url": "https://www.runninghub.cn",
                "protocol": "runninghub",
                "enabled": True,
                "primary": False,
                "image_models": [],
                "chat_models": [],
                "video_models": [],
            },
        ],
    )
    response = providers_client.get("/api/providers/modelscope/fetch-models")
    assert response.status_code == 200
    payload = response.json()
    assert "Tongyi-MAI/Z-Image-Turbo" in payload["image_models"]
    assert "Qwen/Qwen-Image-2512" in payload["image_models"]
    assert payload["dolphin_image_count"] == 2
    assert payload["total"] == 4
    assert payload["chat_models"] == sorted(["Qwen/Qwen3-235B-A22B", "MiniMax/MiniMax-M2.7:MiniMax"])


def test_fetch_models_from_payload_modelscope_returns_upstream_only(client, monkeypatch):
    async def mock_probe_http(base_url, api_key, protocol):
        return {
            "ok": True,
            "status": 200,
            "model_count": 1,
            "image_models": [],
            "chat_models": ["Qwen/Qwen3-235B-A22B"],
            "video_models": [],
            "all": ["Qwen/Qwen3-235B-A22B"],
        }

    monkeypatch.setattr("backend.services.upstream_probe_service.probe_http_models", mock_probe_http)

    async def mock_dolphin():
        return ["Tongyi-MAI/Z-Image-Turbo"]

    monkeypatch.setattr("backend.services.modelscope_dolphin_service.fetch_dolphin_image_model_ids", mock_dolphin)
    response = client.post(
        "/api/providers/fetch-models",
        json={
            "provider_id": "modelscope",
            "base_url": "https://api-inference.modelscope.cn/v1",
            "protocol": "openai",
            "api_key": "test-ms-key",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert "Tongyi-MAI/Z-Image-Turbo" in payload["image_models"]
    assert payload["all"] == ["Qwen/Qwen3-235B-A22B", "Tongyi-MAI/Z-Image-Turbo"]


def test_fetch_modelscope_loras_endpoint(client, monkeypatch):
    async def mock_fetch(**kwargs):
        return {
            "items": [{"id": "Daniel8152/film", "name": "胶片风格"}],
            "total": 99,
            "page_number": 1,
            "page_size": 16,
            "sub_vision_foundation": "Z_IMAGE_TURBO",
            "target_model": "Tongyi-MAI/Z-Image-Turbo",
        }

    monkeypatch.setattr("backend.services.modelscope_dolphin_service.fetch_dolphin_loras", mock_fetch)
    response = client.get(
        "/api/providers/modelscope/fetch-loras?target_model=Tongyi-MAI/Z-Image-Turbo&page_size=16"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["id"] == "Daniel8152/film"
    assert payload["sub_vision_foundation"] == "Z_IMAGE_TURBO"
