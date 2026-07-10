import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_api_provider_state(tmp_path, monkeypatch):
    """Keep tests independent from local provider files and API credentials."""
    providers_path = tmp_path / "api_providers.json"
    env_file = tmp_path / "API" / ".env"
    env_file.parent.mkdir(parents=True)
    def provider(provider_id, protocol="openai", primary=False):
        return {
            "id": provider_id,
            "name": provider_id,
            "base_url": "",
            "protocol": protocol,
            "enabled": True,
            "primary": primary,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
            "rh_apps": [],
            "rh_workflows": [],
        }
    providers_path.write_text(
        json.dumps(
            [
                provider("modelscope", primary=True),
                provider("comfly"),
                provider("runninghub", "runninghub"),
                provider("volcengine", "volcengine"),
                provider("jimeng", "jimeng"),
                provider("codex", "codex"),
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr("backend.config.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.config.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.api_providers_service.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.services.env_helper.API_ENV_FILE", env_file)

    provider_env_keys = {
        "ARK_API_KEY",
        "CHAT_MODELS",
        "COMFLY_API_KEY",
        "COMFLY_BASE_URL",
        "IMAGE_MODELS",
        "MODELSCOPE_API_KEY",
        "MODELSCOPE_CHAT_MODELS",
        "RUNNINGHUB_API_KEY",
        "RUNNINGHUB_WALLET_API_KEY",
        "VIDEO_MODELS",
        "VOLCENGINE_ACCESS_KEY_ID",
        "VOLCENGINE_SECRET_ACCESS_KEY",
    }
    provider_env_keys.update(
        key
        for key in os.environ
        if key.startswith("API_PROVIDER_") and key.endswith("_KEY")
    )
    for key in provider_env_keys:
        monkeypatch.delenv(key, raising=False)


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def canvas_client(client, tmp_path, monkeypatch):
    canvas_dir = tmp_path / "canvases"
    projects_path = tmp_path / "projects.json"
    canvas_dir.mkdir()
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.config.PROJECTS_PATH", projects_path)
    monkeypatch.setattr("backend.services.canvas_service.CANVAS_DIR", str(canvas_dir))
    monkeypatch.setattr("backend.services.project_service.PROJECTS_PATH", str(projects_path))
    monkeypatch.setattr("backend.services.project_service.CANVAS_DIR", str(canvas_dir))
    return client


@pytest.fixture()
def media_client(client, tmp_path, monkeypatch):
    input_dir = tmp_path / "assets" / "input"
    output_dir = tmp_path / "assets" / "output"
    legacy_output = tmp_path / "output"
    preview_dir = tmp_path / "media_previews"
    assets_dir = tmp_path / "assets"
    for d in (input_dir, output_dir, legacy_output, preview_dir):
        d.mkdir(parents=True)
    patches = {
        "backend.config": {
            "OUTPUT_INPUT_DIR": input_dir,
            "OUTPUT_OUTPUT_DIR": output_dir,
            "OUTPUT_DIR": legacy_output,
            "MEDIA_PREVIEW_DIR": preview_dir,
            "ASSETS_DIR": assets_dir,
        },
        "backend.services.media_paths": {
            "OUTPUT_INPUT_DIR": input_dir,
            "OUTPUT_OUTPUT_DIR": output_dir,
            "OUTPUT_DIR": legacy_output,
            "ASSETS_DIR": assets_dir,
        },
        "backend.services.media_preview": {
            "MEDIA_PREVIEW_DIR": preview_dir,
        },
    }
    for module, attrs in patches.items():
        for key, value in attrs.items():
            monkeypatch.setattr(f"{module}.{key}", value)
    return client


@pytest.fixture()
def assets_client(client, tmp_path, monkeypatch):
    assets_dir = tmp_path / "assets"
    upload_dir = assets_dir / "uploads"
    library_dir = assets_dir / "library"
    library_path = tmp_path / "asset_library.json"
    input_dir = assets_dir / "input"
    output_dir = assets_dir / "output"
    for d in (upload_dir, library_dir, input_dir, output_dir):
        d.mkdir(parents=True)
    monkeypatch.setattr("backend.config.ASSETS_DIR", assets_dir)
    monkeypatch.setattr("backend.config.LOCAL_UPLOAD_DIR", upload_dir)
    monkeypatch.setattr("backend.config.ASSET_LIBRARY_PATH", library_path)
    monkeypatch.setattr("backend.config.OUTPUT_INPUT_DIR", input_dir)
    monkeypatch.setattr("backend.services.local_assets_service.LOCAL_UPLOAD_DIR", upload_dir)
    monkeypatch.setattr("backend.services.asset_library_service.ASSET_LIBRARY_PATH", library_path)
    monkeypatch.setattr("backend.config.ASSET_LIBRARY_DIR", library_dir)
    monkeypatch.setattr("backend.config.OUTPUT_OUTPUT_DIR", output_dir)
    monkeypatch.setattr("backend.services.asset_library_service.ASSET_LIBRARY_DIR", library_dir)
    monkeypatch.setattr("backend.services.media_paths.OUTPUT_INPUT_DIR", input_dir)
    monkeypatch.setattr("backend.services.media_paths.OUTPUT_OUTPUT_DIR", output_dir)
    monkeypatch.setattr("backend.services.media_paths.ASSET_LIBRARY_DIR", library_dir)
    monkeypatch.setattr("backend.services.media_paths.ASSETS_DIR", assets_dir)
    return client


@pytest.fixture()
def prompt_library_client(client, tmp_path, monkeypatch):
    prompt_path = tmp_path / "prompt_libraries.json"
    monkeypatch.setattr("backend.config.PROMPT_LIBRARY_PATH", prompt_path)
    monkeypatch.setattr("backend.services.prompt_library_service.PROMPT_LIBRARY_PATH", prompt_path)
    return client


@pytest.fixture()
def shared_folders_client(assets_client, tmp_path, monkeypatch):
    shared_path = tmp_path / "shared_folders.json"
    monkeypatch.setattr("backend.config.BASE_DIR", tmp_path)
    monkeypatch.setattr("backend.services.shared_folders_service.BASE_DIR", tmp_path)
    monkeypatch.setattr("backend.config.SHARED_FOLDERS_PATH", shared_path)
    monkeypatch.setattr("backend.services.shared_folders_service.SHARED_FOLDERS_PATH", shared_path)
    return assets_client


@pytest.fixture()
def workflow_client(client, tmp_path, monkeypatch):
    workflow_dir = tmp_path / "workflows"
    workflow_dir.mkdir(parents=True)
    monkeypatch.setattr("backend.config.WORKFLOW_DIR", workflow_dir)
    monkeypatch.setattr("backend.services.workflow_service.WORKFLOW_DIR", workflow_dir)
    return client


@pytest.fixture()
def comfyui_client(client, tmp_path, monkeypatch):
    env_file = tmp_path / "API" / ".env"
    env_file.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("backend.config.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.env_helper.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.comfyui_client.set_comfyui_instances", lambda instances: instances)
    return client


@pytest.fixture()
def runninghub_client(client, tmp_path, monkeypatch):
    store_path = tmp_path / "runninghub_workflows.json"
    providers_path = tmp_path / "api_providers.json"
    monkeypatch.setattr("backend.config.RUNNINGHUB_WORKFLOW_STORE_PATH", store_path)
    monkeypatch.setattr("backend.config.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.services.runninghub_service.RUNNINGHUB_WORKFLOW_STORE_PATH", store_path)
    monkeypatch.setattr("backend.services.api_providers_service.API_PROVIDERS_PATH", providers_path)
    return client


@pytest.fixture()
def conversation_client(client, tmp_path, monkeypatch):
    conv_dir = tmp_path / "conversations"
    conv_dir.mkdir()
    monkeypatch.setattr("backend.config.CONVERSATION_DIR", conv_dir)
    monkeypatch.setattr("backend.services.conversation_service.CONVERSATION_DIR", conv_dir)
    return client


@pytest.fixture()
def providers_client(client, tmp_path, monkeypatch):
    providers_path = tmp_path / "api_providers.json"
    env_file = tmp_path / "API" / ".env"
    env_file.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("backend.config.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.config.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.api_providers_service.API_PROVIDERS_PATH", providers_path)
    monkeypatch.setattr("backend.services.env_helper.API_ENV_FILE", env_file)
    return client


@pytest.fixture()
def canvas_workflow_client(media_client, tmp_path, monkeypatch):
    from backend.config import ASSETS_DIR
    monkeypatch.setattr("backend.services.canvas_workflow_service.ASSETS_DIR", ASSETS_DIR)
    monkeypatch.setattr("backend.services.canvas_workflow_service.OUTPUT_INPUT_DIR", tmp_path / "assets" / "input")
    return media_client
