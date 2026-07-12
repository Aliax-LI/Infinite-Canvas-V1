from typing import Any

from pydantic import BaseModel


class ApiProviderPayload(BaseModel):
    id: str = ""
    name: str = ""
    base_url: str = ""
    protocol: str = "openai"
    enabled: bool = True
    primary: bool = False
    image_models: list[str] = []
    chat_models: list[str] = []
    video_models: list[str] = []
    rh_apps: list[dict[str, Any]] = []
    rh_workflows: list[dict[str, Any]] = []
    ms_loras: list[dict[str, Any]] = []
    api_key: str | None = None
    wallet_api_key: str | None = None
    clear_key: bool = False
    clear_wallet_key: bool = False
    volcengine_access_key_id: str | None = None
    volcengine_secret_access_key: str | None = None
    volcengine_project_name: str | None = None
    volcengine_region: str | None = None
    clear_volcengine_access_key_id: bool = False
    clear_volcengine_secret_access_key: bool = False


class TestConnectionPayload(BaseModel):
    base_url: str = ""
    api_key: str = ""
    provider_id: str = ""
    protocol: str = "openai"
    image_request_mode: str = "openai"
