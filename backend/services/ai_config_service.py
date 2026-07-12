import os

from backend.config import COMFYUI_INSTANCES
from backend.services.api_providers_service import provider_env_key_value, public_api_providers, strip_auth_scheme

CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "gpt-image-2")
AI_BASE_URL = os.getenv("COMFLY_BASE_URL", "https://ai.comfly.chat").rstrip("/")
AI_API_KEY = os.getenv("COMFLY_API_KEY", "")

MODELSCOPE_CHAT_BASE_URL = "https://api-inference.modelscope.cn/v1"

VIDEO_MODEL_DEFAULTS = [
    "veo2", "veo2-fast", "veo2-pro",
    "veo3", "veo3-fast", "veo3-pro",
    "veo3.1", "veo3.1-fast", "veo3.1-quality", "veo3.1-lite",
    "sora-2", "sora-2-pro",
    "wan2.6-t2v", "wan2.6-i2v",
    "doubao-seedance-2-0-260128",
]


def modelscope_chat_models() -> list[str]:
    configured = [m.strip() for m in os.getenv("MODELSCOPE_CHAT_MODELS", "").split(",") if m.strip()]
    return list(dict.fromkeys(configured))


def model_list(env_name: str, primary: str, defaults: list[str]) -> list[str]:
    configured = os.getenv(env_name, "")
    configured_values = [item.strip() for item in configured.split(",") if item.strip()]
    values = configured_values or [primary, *defaults]
    deduped: list[str] = []
    for value in values:
        if value and value not in deduped:
            deduped.append(value)
    return deduped


def chat_models() -> list[str]:
    return model_list("CHAT_MODELS", CHAT_MODEL, ["gpt-4o-mini", "gemini-3.1-flash-image-preview-2k"])


def image_models() -> list[str]:
    return model_list("IMAGE_MODELS", IMAGE_MODEL, ["nano-banana-pro"])


def video_models() -> list[str]:
    return model_list("VIDEO_MODELS", "veo3-fast", VIDEO_MODEL_DEFAULTS)


def modelscope_api_key(explicit_key: str = "") -> str:
    return (
        strip_auth_scheme(explicit_key, "Bearer")
        or strip_auth_scheme(provider_env_key_value("modelscope"), "Bearer")
        or strip_auth_scheme(os.getenv("MODELSCOPE_API_KEY", ""), "Bearer")
    )


def ai_config_payload() -> dict:
    from backend.services.secrets_service import get_secret

    chats = chat_models()
    preferred_chat_model = next((m for m in chats if m == "gpt-5.5"), chats[0] if chats else CHAT_MODEL)
    providers = public_api_providers()
    comfly_key = provider_env_key_value("comfly") or get_secret("COMFLY_API_KEY")
    return {
        "base_url": AI_BASE_URL,
        "chat_model": preferred_chat_model,
        "image_model": IMAGE_MODEL,
        "chat_models": chats,
        "image_models": image_models(),
        "video_models": video_models(),
        "comfy_instances": COMFYUI_INSTANCES,
        "api_providers": providers,
        "has_api_key": bool(comfly_key or AI_API_KEY),
        "ms_chat_models": modelscope_chat_models(),
        "has_ms_key": bool(modelscope_api_key()),
    }


def ai_models_payload() -> dict:
    return {
        "chat_models": chat_models(),
        "image_models": image_models(),
        "video_models": video_models(),
    }


def global_token_payload() -> dict:
    saved_token = modelscope_api_key()
    return {"token": saved_token}



def modelscope_image_api_root() -> str:
    return MODELSCOPE_CHAT_BASE_URL.rstrip("/")
