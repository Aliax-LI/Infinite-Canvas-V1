import os
import re

from backend.services.api_providers_service import load_api_providers

ONLINE_IMAGE_REFERENCE_MAX = int(os.getenv("ONLINE_IMAGE_REFERENCE_MAX", "20"))

IMAGE_PARAM_RATIOS = [
    {"value": "1:1", "label": "1:1"},
    {"value": "3:4", "label": "3:4"},
    {"value": "4:3", "label": "4:3"},
    {"value": "16:9", "label": "16:9"},
    {"value": "9:16", "label": "9:16"},
    {"value": "2:3", "label": "2:3"},
    {"value": "3:2", "label": "3:2"},
]
IMAGE_PARAM_RESOLUTIONS = [
    {"value": "1k", "label": "1K"},
    {"value": "2k", "label": "2K"},
    {"value": "4k", "label": "4K"},
]


def provider_protocol(provider: dict) -> str:
    return str((provider or {}).get("protocol") or "openai").strip().lower()


def is_volcengine_provider(provider: dict) -> bool:
    return provider_protocol(provider) == "volcengine"


def is_runninghub_provider(provider: dict) -> bool:
    return provider_protocol(provider) == "runninghub" or str((provider or {}).get("id") or "").strip().lower() == "runninghub"


def is_gpt_image_2_model(model: str) -> bool:
    raw = str(model or "").strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    compact = re.sub(r"[^a-z0-9]+", "", raw)
    return (
        normalized == "gpt-image-2"
        or normalized.startswith("gpt-image-2-")
        or normalized.endswith("-gpt-image-2")
        or "-gpt-image-2-" in normalized
        or compact == "gptimage2"
        or compact.startswith("gptimage2")
        or compact.endswith("gptimage2")
    )


def build_image_param_fields(engine: str, provider: dict, model: str) -> list[dict]:
    gpt_auto_size = engine == "api" and is_gpt_image_2_model(model)
    image_resolutions = ([{"value": "auto", "label": "自动"}] + IMAGE_PARAM_RESOLUTIONS) if gpt_auto_size else IMAGE_PARAM_RESOLUTIONS
    size_field = {
        "key": "size",
        "type": "size",
        "label": "尺寸",
        "ratios": IMAGE_PARAM_RATIOS,
        "resolutions": image_resolutions,
        "default": {"ratio": "1:1", "resolution": "auto" if gpt_auto_size else "1k"},
    }
    count_field = {
        "key": "n",
        "type": "int",
        "label": "数量",
        "control": "chips",
        "options": [1, 2, 3, 4],
        "default": 1,
    }
    refs_field = {
        "key": "reference_images",
        "type": "refs",
        "label": "参考图",
        "max": ONLINE_IMAGE_REFERENCE_MAX,
    }

    if engine == "runninghub":
        return [{
            "key": "_rh_notice",
            "type": "notice",
            "label": "RunningHub 工作流参数将按所选工作流动态加载（开发中）。",
        }]

    fields = [size_field]
    if engine in ("api", "volcengine"):
        fields.append({
            "key": "quality",
            "type": "select",
            "label": "质量",
            "control": "chips",
            "options": [
                {"value": "auto", "label": "自动"},
                {"value": "low", "label": "低"},
                {"value": "medium", "label": "中"},
                {"value": "high", "label": "高"},
            ],
            "default": "auto",
        })
    fields.append(count_field)
    fields.append(refs_field)
    return fields


def resolve_image_params_engine(provider_id: str, provider: dict) -> str:
    if is_runninghub_provider(provider):
        return "runninghub"
    if (provider_id or "").strip().lower() == "modelscope":
        return "modelscope"
    if is_volcengine_provider(provider):
        return "volcengine"
    return "api"


def image_params_payload(provider_id: str = "", model: str = "") -> dict:
    providers = load_api_providers()
    pid = (provider_id or "").strip().lower()
    provider = next((p for p in providers if p.get("id") == pid), None) or {}
    engine = resolve_image_params_engine(pid, provider)
    return {
        "engine": engine,
        "submit": "/api/canvas-image-tasks",
        "fields": build_image_param_fields(engine, provider, model),
    }
