"""Fetch ModelScope AIGC image model IDs from the public model catalog API."""

from __future__ import annotations

import json
import logging

import httpx

logger = logging.getLogger(__name__)

DOLPHIN_MODELS_URL = "https://www.modelscope.cn/api/v1/dolphin/models"
DOLPHIN_PAGE_SIZE = 100

# Mainstream API-Inference image architectures (excludes SD/FLUX1 legacy community checkpoints).
MAINSTREAM_SUB_VISION_FOUNDATIONS = [
    "Z_IMAGE_TURBO",
    "Z_IMAGE",
    "FLUX2_KLEIN_BASE_4B",
    "FLUX2_KLEIN_BASE_9B",
    "FLUX2_KLEIN_9B",
    "FLUX2_KLEIN_4B",
    "FLUX2_DEV",
    "FIRERED_IMAGE_EDIT",
    "QWEN_IMAGE_2512",
    "QWEN_IMAGE_EDIT_2509",
    "QWEN_IMAGE_EDIT_2511",
    "HIDREAM_O1_IMAGE",
    "IDEOGRAM_4_FP8_IMAGE",
    "KREA_2_TURBO",
]

# Preferred order for stable UI listing.
MAINSTREAM_MODEL_ORDER = [
    "Tongyi-MAI/Z-Image-Turbo",
    "Tongyi-MAI/Z-Image",
    "Qwen/Qwen-Image-2512",
    "Qwen/Qwen-Image-Edit-2511",
    "Qwen/Qwen-Image-Edit-2509",
    "black-forest-labs/FLUX.2-klein-9B",
    "black-forest-labs/FLUX.2-klein-4B",
    "black-forest-labs/FLUX.2-klein-base-9B",
    "black-forest-labs/FLUX.2-klein-base-4B",
    "black-forest-labs/FLUX.2-dev",
    "FireRedTeam/FireRed-Image-Edit-1.1",
    "HiDream-ai/HiDream-O1-Image",
    "ideogram-ai/ideogram-4-fp8",
    "krea/Krea-2-Turbo",
]

IMAGE_MODEL_TO_SUB_VISION: dict[str, str] = {
    "Tongyi-MAI/Z-Image-Turbo": "Z_IMAGE_TURBO",
    "Tongyi-MAI/Z-Image": "Z_IMAGE",
    "Qwen/Qwen-Image-2512": "QWEN_IMAGE_2512",
    "Qwen/Qwen-Image-Edit-2511": "QWEN_IMAGE_EDIT_2511",
    "Qwen/Qwen-Image-Edit-2509": "QWEN_IMAGE_EDIT_2509",
    "black-forest-labs/FLUX.2-klein-9B": "FLUX2_KLEIN_9B",
    "black-forest-labs/FLUX.2-klein-4B": "FLUX2_KLEIN_4B",
    "black-forest-labs/FLUX.2-klein-base-9B": "FLUX2_KLEIN_BASE_9B",
    "black-forest-labs/FLUX.2-klein-base-4B": "FLUX2_KLEIN_BASE_4B",
    "black-forest-labs/FLUX.2-dev": "FLUX2_DEV",
    "FireRedTeam/FireRed-Image-Edit-1.1": "FIRERED_IMAGE_EDIT",
    "HiDream-ai/HiDream-O1-Image": "HIDREAM_O1_IMAGE",
    "ideogram-ai/ideogram-4-fp8": "IDEOGRAM_4_FP8_IMAGE",
    "krea/Krea-2-Turbo": "KREA_2_TURBO",
}

DOLPHIN_LORA_PAGE_SIZE = 16


def resolve_sub_vision_foundation(*, target_model: str = "", sub_vision_foundation: str = "") -> str:
    explicit = str(sub_vision_foundation or "").strip().upper()
    if explicit:
        return explicit
    model_id = str(target_model or "").strip()
    if not model_id:
        return ""
    if model_id in IMAGE_MODEL_TO_SUB_VISION:
        return IMAGE_MODEL_TO_SUB_VISION[model_id]
    lowered = model_id.lower()
    if "z-image-turbo" in lowered or "z_image_turbo" in lowered:
        return "Z_IMAGE_TURBO"
    if "z-image" in lowered or "z_image" in lowered:
        return "Z_IMAGE"
    if "qwen-image-edit-2511" in lowered:
        return "QWEN_IMAGE_EDIT_2511"
    if "qwen-image-edit-2509" in lowered:
        return "QWEN_IMAGE_EDIT_2509"
    if "qwen-image-2512" in lowered or "qwen-image" in lowered:
        return "QWEN_IMAGE_2512"
    if "flux.2-klein-base-9b" in lowered:
        return "FLUX2_KLEIN_BASE_9B"
    if "flux.2-klein-base-4b" in lowered:
        return "FLUX2_KLEIN_BASE_4B"
    if "flux.2-klein-9b" in lowered:
        return "FLUX2_KLEIN_9B"
    if "flux.2-klein-4b" in lowered:
        return "FLUX2_KLEIN_4B"
    if "flux.2-dev" in lowered:
        return "FLUX2_DEV"
    if "firered-image-edit" in lowered:
        return "FIRERED_IMAGE_EDIT"
    if "hidream-o1-image" in lowered:
        return "HIDREAM_O1_IMAGE"
    if "ideogram-4-fp8" in lowered:
        return "IDEOGRAM_4_FP8_IMAGE"
    if "krea-2-turbo" in lowered:
        return "KREA_2_TURBO"
    return ""


def build_dolphin_loras_payload(
    *,
    sub_vision_foundation: str,
    page_number: int = 1,
    page_size: int = DOLPHIN_LORA_PAGE_SIZE,
    name: str = "",
) -> dict:
    return {
        "PageSize": page_size,
        "PageNumber": page_number,
        "SortBy": "AigcDefault",
        "Target": "",
        "IsAigc": True,
        "Name": name or "",
        "SingleCriterion": [
            {
                "category": "aigc_type",
                "DateType": "string",
                "predicate": "equal",
                "StringValue": "LoRA",
            },
            {
                "category": "vision_foundation",
                "DateType": "string",
                "predicate": "equal",
                "StringValue": "all",
            },
        ],
        "Criterion": [
            {
                "category": "sub_vision_foundation",
                "predicate": "contains",
                "values": [sub_vision_foundation],
            }
        ],
        "IsStar": False,
    }


def extract_dolphin_display_name(item: dict) -> str:
    chinese = str(item.get("ChineseName") or "").strip()
    if chinese:
        return chinese
    name = str(item.get("Name") or "").strip()
    if name:
        return name
    return extract_dolphin_model_id(item)


def parse_dolphin_loras_response(raw: dict) -> tuple[list[dict[str, str]], int]:
    if not isinstance(raw, dict) or raw.get("Code") != 200:
        return [], 0
    data = raw.get("Data") if isinstance(raw.get("Data"), dict) else {}
    block = data.get("Model") if isinstance(data.get("Model"), dict) else {}
    models = block.get("Models") if isinstance(block.get("Models"), list) else []
    total = int(block.get("TotalCount") or 0)
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in models:
        if not isinstance(item, dict):
            continue
        model_id = extract_dolphin_model_id(item)
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        items.append({"id": model_id, "name": extract_dolphin_display_name(item)})
    return items, total


async def fetch_dolphin_loras(
    *,
    target_model: str = "",
    sub_vision_foundation: str = "",
    page_number: int = 1,
    page_size: int = DOLPHIN_LORA_PAGE_SIZE,
    name: str = "",
) -> dict:
    sub = resolve_sub_vision_foundation(
        target_model=target_model,
        sub_vision_foundation=sub_vision_foundation,
    )
    if not sub:
        raise ValueError("请先选择可识别的绑定模型，或指定 sub_vision_foundation")
    page_number = max(1, int(page_number or 1))
    page_size = max(1, min(100, int(page_size or DOLPHIN_LORA_PAGE_SIZE)))
    payload = build_dolphin_loras_payload(
        sub_vision_foundation=sub,
        page_number=page_number,
        page_size=page_size,
        name=name,
    )
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(DOLPHIN_MODELS_URL, json=payload, headers={"Content-Type": "application/json"})
        resp.raise_for_status()
        raw = resp.json() if resp.text else {}
    items, total = parse_dolphin_loras_response(raw)
    return {
        "items": items,
        "total": total,
        "page_number": page_number,
        "page_size": page_size,
        "sub_vision_foundation": sub,
        "target_model": str(target_model or "").strip(),
    }


def build_dolphin_models_payload(*, page_number: int, page_size: int = DOLPHIN_PAGE_SIZE) -> dict:
    return {
        "PageSize": page_size,
        "PageNumber": page_number,
        "SortBy": "AigcDefault",
        "Target": "",
        "IsAigc": True,
        "Name": "",
        "SingleCriterion": [
            {
                "category": "aigc_type",
                "DateType": "string",
                "predicate": "equal",
                "StringValue": "Checkpoint",
            },
            {
                "category": "vision_foundation",
                "DateType": "string",
                "predicate": "equal",
                "StringValue": "all",
            },
        ],
        "Criterion": [
            {
                "category": "sub_vision_foundation",
                "predicate": "contains",
                "values": MAINSTREAM_SUB_VISION_FOUNDATIONS,
            }
        ],
        "IsStar": False,
    }


def extract_dolphin_model_id(item: dict) -> str:
    backend = item.get("BackendSupport") if isinstance(item.get("BackendSupport"), dict) else {}
    model_id = str(backend.get("model_id") or "").strip()
    if model_id:
        return model_id
    muse = item.get("MuseInfo") if isinstance(item.get("MuseInfo"), dict) else {}
    muse_model = muse.get("model") if isinstance(muse.get("model"), dict) else {}
    model_name = str(muse_model.get("modelName") or "").strip()
    if model_name:
        return model_name
    path = str(item.get("Path") or "").strip()
    name = str(item.get("Name") or "").strip()
    if path and name:
        return f"{path}/{name}"
    return name or path


def extract_sub_vision_foundation(item: dict) -> str:
    raw_attrs = item.get("AigcAttributes")
    if not raw_attrs:
        return ""
    try:
        attrs = json.loads(raw_attrs) if isinstance(raw_attrs, str) else raw_attrs
    except (TypeError, json.JSONDecodeError):
        return ""
    if not isinstance(attrs, dict):
        return ""
    return str(attrs.get("SubVisionFoundation") or "").strip()


def parse_mainstream_dolphin_models(raw: dict) -> list[str]:
    """Pick one AigcDefault-ranked model per mainstream sub_vision_foundation."""
    if not isinstance(raw, dict) or raw.get("Code") != 200:
        return []
    data = raw.get("Data") if isinstance(raw.get("Data"), dict) else {}
    block = data.get("Model") if isinstance(data.get("Model"), dict) else {}
    models = block.get("Models") if isinstance(block.get("Models"), list) else []

    by_sub: dict[str, str] = {}
    for item in models:
        if not isinstance(item, dict):
            continue
        sub = extract_sub_vision_foundation(item)
        if not sub or sub in by_sub or sub not in MAINSTREAM_SUB_VISION_FOUNDATIONS:
            continue
        model_id = extract_dolphin_model_id(item)
        if model_id:
            by_sub[sub] = model_id

    ordered = [mid for mid in MAINSTREAM_MODEL_ORDER if mid in set(by_sub.values())]
    extras = sorted({mid for mid in by_sub.values() if mid not in ordered})
    return ordered + extras


async def fetch_dolphin_image_model_ids() -> list[str]:
    """Fetch mainstream image model IDs (one per architecture, first AigcDefault page)."""
    payload = build_dolphin_models_payload(page_number=1, page_size=DOLPHIN_PAGE_SIZE)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(DOLPHIN_MODELS_URL, json=payload, headers={"Content-Type": "application/json"})
        resp.raise_for_status()
        raw = resp.json() if resp.text else {}
    return parse_mainstream_dolphin_models(raw)


def merge_modelscope_fetch_result(result: dict, dolphin_image_ids: list[str]) -> dict:
    """Merge dolphin catalog image models with API-Inference /v1/models response."""
    dolphin_set = set(dolphin_image_ids)
    inference_image = set(result.get("image_models") or [])
    inference_chat = list(result.get("chat_models") or [])
    inference_video = list(result.get("video_models") or [])
    inference_all = set(result.get("all") or [])

    image_models = sorted(dolphin_set | inference_image)
    chat_models = sorted(m for m in inference_chat if m not in dolphin_set)
    video_models = sorted(inference_video)
    all_models = sorted(inference_all | dolphin_set)

    parts: list[str] = []
    if dolphin_set:
        parts.append(f"主流生图模型 {len(dolphin_set)} 个（魔搭模型库）")
    if chat_models:
        parts.append(f"对话模型 {len(chat_models)} 个（/v1/models）")
    if video_models:
        parts.append(f"视频模型 {len(video_models)} 个")
    message = f"已拉取 {len(all_models)} 个模型"
    if parts:
        message = f"{message}：{'，'.join(parts)}"

    return {
        **result,
        "total": len(all_models),
        "model_count": len(all_models),
        "image_models": image_models,
        "chat_models": chat_models,
        "video_models": video_models,
        "all": all_models,
        "message": message,
        "dolphin_image_count": len(dolphin_set),
    }


async def enrich_modelscope_fetch_result(result: dict) -> dict:
    try:
        dolphin_ids = await fetch_dolphin_image_model_ids()
    except Exception as exc:
        logger.warning("ModelScope dolphin catalog fetch failed: %s", exc)
        suffix = f"；生图模型库拉取失败：{str(exc)[:120]}"
        return {**result, "message": f"{result.get('message') or '拉取完成'}{suffix}"}
    return merge_modelscope_fetch_result(result, dolphin_ids)
