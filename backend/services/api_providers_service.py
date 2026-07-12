import json
import os
import re
from threading import Lock

from fastapi import HTTPException

from backend.config import (
    API_PROVIDERS_PATH,
    RUNNINGHUB_DEFAULT_BASE_URL,
    VOLCENGINE_DEFAULT_BASE_URL,
    VOLCENGINE_DEFAULT_PROJECT_NAME,
    VOLCENGINE_DEFAULT_REGION,
    ensure_data_dirs,
)

GLOBAL_CONFIG_LOCK = Lock()
PROVIDER_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")


def provider_key_env(provider_id: str) -> str:
    mapping = {
        "comfly": "COMFLY_API_KEY",
        "modelscope": "MODELSCOPE_API_KEY",
        "runninghub": "RUNNINGHUB_API_KEY",
        "volcengine": "ARK_API_KEY",
    }
    return mapping.get(provider_id, f"API_PROVIDER_{re.sub(r'[^A-Za-z0-9]', '_', provider_id).upper()}_KEY")


def runninghub_wallet_key_env() -> str:
    return "RUNNINGHUB_WALLET_API_KEY"


def strip_auth_scheme(value: str, scheme: str = "Bearer") -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(rf"^{re.escape(scheme)}\s+", "", text, flags=re.I).strip()


def bearer_auth_value(value: str) -> str:
    token = strip_auth_scheme(value, "Bearer")
    return f"Bearer {token}" if token else ""


def provider_env_key_value(provider_id: str) -> str:
    from backend.services.secrets_service import get_secret

    return get_secret(provider_key_env(provider_id))


def is_modelscope_context(provider_id: str = "", base_url: str = "") -> bool:
    """True when probing ModelScope API-Inference (api-inference.modelscope.cn/.ai).

    Official API-Inference exposes:
    - GET /v1/models — lists chat/LLM models (OpenAI-compatible)
    - POST /v1/images/generations — image generation (model id required in body)
    - GET /v1/tasks/{task_id} — async task polling

    Image checkpoint IDs are fetched from the public model catalog:
    PUT https://www.modelscope.cn/api/v1/dolphin/models (AIGC Checkpoint filter).
    """
    if str(provider_id or "").strip().lower() == "modelscope":
        return True
    host = str(base_url or "").strip().lower()
    return "modelscope.cn" in host or "modelscope.ai" in host


def normalize_ms_loras(values: list | None) -> list[dict]:
    normalized: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for raw in values or []:
        if not isinstance(raw, dict):
            continue
        lora_id = str(raw.get("id") or "").strip()
        if not lora_id:
            continue
        target_model = str(raw.get("target_model") or raw.get("model") or "").strip()
        if not target_model:
            continue
        key = (target_model, lora_id)
        if key in seen:
            continue
        seen.add(key)
        try:
            strength = float(raw.get("strength", raw.get("default_strength", 0.8)))
        except (TypeError, ValueError):
            strength = 0.8
        strength = max(0.0, min(2.0, strength))
        name = re.sub(r"\s+", " ", str(raw.get("name") or "").strip())[:80]
        normalized.append({
            "id": lora_id[:180],
            "name": name or lora_id,
            "target_model": target_model[:180],
            "strength": strength,
            "enabled": bool(raw.get("enabled", True)),
            "note": str(raw.get("note") or "").strip()[:300],
        })
    return normalized


def default_api_providers() -> list[dict]:
    return [
        {"id": "modelscope", "name": "ModelScope", "base_url": "https://api-inference.modelscope.cn/v1", "protocol": "openai", "enabled": True, "primary": False, "image_models": [], "chat_models": [], "video_models": [], "rh_apps": [], "rh_workflows": [], "ms_loras": []},
        {"id": "runninghub", "name": "RunningHub", "base_url": RUNNINGHUB_DEFAULT_BASE_URL, "protocol": "runninghub", "enabled": True, "primary": False, "image_models": [], "chat_models": [], "video_models": [], "rh_apps": [], "rh_workflows": []},
        {
            "id": "volcengine",
            "name": "火山引擎",
            "base_url": VOLCENGINE_DEFAULT_BASE_URL,
            "protocol": "volcengine",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
            "rh_apps": [],
            "rh_workflows": [],
            "volcengine_project_name": VOLCENGINE_DEFAULT_PROJECT_NAME,
            "volcengine_region": VOLCENGINE_DEFAULT_REGION,
        },
    ]


def merge_default_api_providers(providers: list[dict], inject_missing: bool = True) -> list[dict]:
    """Ensure fixed entry platforms (modelscope, runninghub, volcengine) are always present."""
    merged = [dict(item) for item in providers]
    defaults = {item["id"]: item for item in default_api_providers()}

    for provider_id in ("modelscope", "runninghub", "volcengine"):
        default = defaults.get(provider_id)
        if not default:
            continue
        current = next((item for item in merged if item.get("id") == provider_id), None)
        if not current:
            if provider_id == "volcengine":
                legacy = next(
                    (
                        item
                        for item in merged
                        if item.get("id") != "volcengine"
                        and str(item.get("protocol") or "").lower() == "volcengine"
                    ),
                    None,
                )
                if legacy:
                    merged.append({
                        **default,
                        "base_url": legacy.get("base_url") or default["base_url"],
                        "image_models": list(legacy.get("image_models") or []),
                        "chat_models": list(legacy.get("chat_models") or []),
                        "video_models": list(legacy.get("video_models") or []),
                    })
                    continue
            merged.append(dict(default))
        else:
            if not current.get("base_url"):
                current["base_url"] = default["base_url"]
            if provider_id == "runninghub" and (not current.get("protocol") or current.get("protocol") == "openai"):
                current["protocol"] = "runninghub"
            if provider_id == "volcengine":
                current["protocol"] = "volcengine"
                current["volcengine_project_name"] = (
                    str(current.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME).strip()
                    or VOLCENGINE_DEFAULT_PROJECT_NAME
                )
                current["volcengine_region"] = (
                    str(current.get("volcengine_region") or VOLCENGINE_DEFAULT_REGION).strip()
                    or VOLCENGINE_DEFAULT_REGION
                )
    return merged


def normalize_provider(item: dict) -> dict:
    provider_id = str(item.get("id") or "").strip().lower()
    if not PROVIDER_ID_RE.fullmatch(provider_id):
        raise HTTPException(status_code=400, detail=f"API 平台 ID 不合法：{provider_id or '(empty)'}")
    name = re.sub(r"\s+", " ", str(item.get("name") or provider_id).strip())[:60] or provider_id
    base_url = str(item.get("base_url") or "").strip().rstrip("/")
    protocol = str(item.get("protocol") or "openai").strip().lower()
    if provider_id == "runninghub":
        protocol = "runninghub"
        base_url = base_url or RUNNINGHUB_DEFAULT_BASE_URL
    volc_project = re.sub(r"\s+", " ", str(item.get("volcengine_project_name") or "").strip())[:80]
    volc_region = re.sub(r"\s+", " ", str(item.get("volcengine_region") or "").strip())[:40]
    if provider_id == "volcengine":
        protocol = "volcengine"
        base_url = base_url or VOLCENGINE_DEFAULT_BASE_URL
        volc_project = volc_project or VOLCENGINE_DEFAULT_PROJECT_NAME
        volc_region = volc_region or VOLCENGINE_DEFAULT_REGION
    normalized = {
        "id": provider_id, "name": name, "base_url": base_url, "protocol": protocol,
        "enabled": bool(item.get("enabled", True)), "primary": bool(item.get("primary", False)),
        "image_models": list(item.get("image_models") or []), "chat_models": list(item.get("chat_models") or []),
        "video_models": list(item.get("video_models") or []), "rh_apps": list(item.get("rh_apps") or []),
        "rh_workflows": list(item.get("rh_workflows") or []),
        "ms_loras": normalize_ms_loras(item.get("ms_loras") or []) if provider_id == "modelscope" else [],
    }
    if provider_id == "volcengine":
        normalized["volcengine_project_name"] = volc_project
        normalized["volcengine_region"] = volc_region
    return normalized


def load_api_providers() -> list[dict]:
    from backend.repositories import get_api_providers_repository

    ensure_data_dirs()
    defaults = default_api_providers()
    raw = get_api_providers_repository().load_all()
    if not raw:
        return defaults
    try:
        providers = [normalize_provider(item) for item in raw if isinstance(item, dict)]
        return merge_default_api_providers(providers or defaults, inject_missing=not bool(providers))
    except HTTPException:
        raise
    except (ValueError, TypeError):
        return defaults


def save_api_providers(providers: list[dict]) -> None:
    from backend.repositories import get_api_providers_repository

    ensure_data_dirs()
    with GLOBAL_CONFIG_LOCK:
        get_api_providers_repository().save_all(providers)



def get_primary_provider_id(providers: list[dict] | None = None) -> str:
    providers = providers or load_api_providers()
    primary = next((p["id"] for p in providers if p.get("primary")), None)
    if primary:
        return primary
    return providers[0]["id"] if providers else "modelscope"


def get_api_provider(provider_id: str = "comfly") -> dict:
    providers = load_api_providers()
    target = (provider_id or "").strip().lower()
    if not target or not any(p["id"] == target for p in providers):
        target = get_primary_provider_id(providers)
    provider = next((p for p in providers if p["id"] == target), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"未找到 API 平台：{target}")
    if not provider.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"API 平台已禁用：{provider.get('name') or target}")
    return provider

def get_api_provider_exact(provider_id: str) -> dict:
    providers = load_api_providers()
    target = (provider_id or "").strip().lower()
    provider = next((p for p in providers if p.get("id") == target), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"未找到 API 平台：{target or '(empty)'}")
    if not provider.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"API 平台已禁用：{provider.get('name') or target}")
    return provider


def mask_secret(value: str) -> str:
    if not value:
        return ""
    tail = value[-4:] if len(value) > 4 else value
    return f"••••••••{tail}"


def runninghub_wallet_key_value() -> str:
    from backend.services.secrets_service import get_secret

    return get_secret(runninghub_wallet_key_env())


def volcengine_access_key_env() -> str:
    return "VOLCENGINE_ACCESS_KEY_ID"


def volcengine_secret_key_env() -> str:
    return "VOLCENGINE_SECRET_ACCESS_KEY"


def volcengine_access_key_value() -> str:
    from backend.services.secrets_service import get_secret

    return get_secret(volcengine_access_key_env())


def volcengine_secret_key_value() -> str:
    from backend.services.secrets_service import get_secret

    return get_secret(volcengine_secret_key_env())


def public_provider(provider: dict) -> dict:
    key = provider_env_key_value(provider["id"])
    item = {
        **provider,
        "has_key": bool(key),
        "key_preview": mask_secret(key),
        "key_env": provider_key_env(provider["id"]),
    }
    if provider.get("id") == "runninghub":
        wallet_key = runninghub_wallet_key_value()
        item.update({
            "has_wallet_key": bool(wallet_key),
            "wallet_key_preview": mask_secret(wallet_key),
            "wallet_key_env": runninghub_wallet_key_env(),
        })
    if provider.get("id") == "volcengine":
        ak = volcengine_access_key_value()
        sk = volcengine_secret_key_value()
        item.update({
            "has_volcengine_access_key": bool(ak),
            "volcengine_access_key_preview": mask_secret(ak),
            "volcengine_access_key_env": volcengine_access_key_env(),
            "has_volcengine_secret_key": bool(sk),
            "volcengine_secret_key_preview": mask_secret(sk),
            "volcengine_secret_key_env": volcengine_secret_key_env(),
            "volcengine_project_name": provider.get("volcengine_project_name") or VOLCENGINE_DEFAULT_PROJECT_NAME,
            "volcengine_region": provider.get("volcengine_region") or VOLCENGINE_DEFAULT_REGION,
        })
    return item


def public_api_providers() -> list[dict]:
    return [public_provider(p) for p in load_api_providers()]


def save_providers_payload(payload) -> list[dict]:
    from backend.services.env_helper import update_env_values
    from backend.services.secrets_service import set_secrets

    providers: list[dict] = []
    env_updates: dict[str, str] = {}
    secret_updates: dict[str, str] = {}
    raw_primary_flags = [bool(getattr(item, "primary", False)) for item in payload]

    for item in payload:
        provider = normalize_provider(item.model_dump(exclude={"api_key", "wallet_api_key", "volcengine_access_key_id", "volcengine_secret_access_key"}))
        if any(existing["id"] == provider["id"] for existing in providers):
            raise HTTPException(status_code=400, detail=f"API 平台 ID 重复：{provider['id']}")
        providers.append(provider)

        key_env = provider_key_env(provider["id"])
        if item.clear_key:
            secret_updates[key_env] = ""
        elif item.api_key is not None and item.api_key.strip():
            secret_updates[key_env] = item.api_key.strip()

        if provider["id"] == "runninghub":
            wallet_env = runninghub_wallet_key_env()
            if item.clear_wallet_key:
                secret_updates[wallet_env] = ""
            elif item.wallet_api_key is not None and item.wallet_api_key.strip():
                secret_updates[wallet_env] = item.wallet_api_key.strip()
            provider["protocol"] = "runninghub"

        if provider["id"] == "volcengine":
            ak_env = volcengine_access_key_env()
            sk_env = volcengine_secret_key_env()
            if item.clear_volcengine_access_key_id:
                secret_updates[ak_env] = ""
            elif item.volcengine_access_key_id is not None and item.volcengine_access_key_id.strip():
                secret_updates[ak_env] = item.volcengine_access_key_id.strip()
            if item.clear_volcengine_secret_access_key:
                secret_updates[sk_env] = ""
            elif item.volcengine_secret_access_key is not None and item.volcengine_secret_access_key.strip():
                secret_updates[sk_env] = item.volcengine_secret_access_key.strip()
            provider["protocol"] = "volcengine"

        if provider["id"] == "comfly":
            env_updates["COMFLY_BASE_URL"] = provider["base_url"]
            env_updates["IMAGE_MODELS"] = ",".join(provider["image_models"])
            env_updates["CHAT_MODELS"] = ",".join(provider["chat_models"])
            env_updates["VIDEO_MODELS"] = ",".join(provider.get("video_models") or [])

        if provider["id"] == "modelscope":
            env_updates["MODELSCOPE_CHAT_MODELS"] = ",".join(provider["chat_models"])

    if not providers:
        raise HTTPException(status_code=400, detail="至少保留一个 API 平台")

    primary_indices = [i for i, flag in enumerate(raw_primary_flags) if flag]
    if primary_indices:
        winner = primary_indices[-1]
        for i, provider in enumerate(providers):
            provider["primary"] = i == winner

    save_api_providers(providers)
    if secret_updates:
        set_secrets(secret_updates)
    if env_updates:
        update_env_values(env_updates)
    return providers
