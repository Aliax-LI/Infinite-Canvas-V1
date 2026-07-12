import json

from backend.repositories import reset_repositories
from backend.services import api_providers_service


def test_load_api_providers_injects_volcengine_when_missing(tmp_path, monkeypatch):
    providers_path = tmp_path / "api_providers.json"
    providers_path.write_text(
        json.dumps(
            [
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
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.config.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.repositories.json.api_providers_repository.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.services.api_providers_service.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "json")
    monkeypatch.setattr("backend.repositories.factory.STORAGE_BACKEND", "json")
    reset_repositories()

    providers = api_providers_service.load_api_providers()
    volc = next((p for p in providers if p["id"] == "volcengine"), None)
    assert volc is not None
    assert volc["protocol"] == "volcengine"
    assert volc["base_url"] == "https://ark.cn-beijing.volces.com/api/v3"
    reset_repositories()


def test_public_provider_reports_volcengine_key_state(monkeypatch):
    from backend.services.env_helper import load_env_file

    monkeypatch.setenv("ARK_API_KEY", "abc12345")

    public = api_providers_service.public_provider(
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
        }
    )
    assert public["has_key"] is True
    assert public["key_preview"].endswith("2345")
    assert public["has_volcengine_access_key"] is False
    assert public["volcengine_project_name"] == "default"
    monkeypatch.delenv("ARK_API_KEY", raising=False)
