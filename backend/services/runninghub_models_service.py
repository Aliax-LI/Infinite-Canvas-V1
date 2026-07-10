import json

import httpx
from fastapi import HTTPException

from backend.config import (
    RUNNINGHUB_DEFAULT_IMAGE_MODELS,
    RUNNINGHUB_DEFAULT_VIDEO_MODELS,
    RUNNINGHUB_FALLBACK_CHAT_MODELS,
    RUNNINGHUB_LLM_MODELS_URLS,
    RUNNINGHUB_MODEL_REGISTRY_URL,
    STATIC_RUNNINGHUB_MODEL_REGISTRY_FILE,
)
def looks_like_html_response(text: str) -> bool:
    sample = str(text or "").lstrip()[:200].lower()
    return sample.startswith("<!doctype html") or sample.startswith("<html") or "<head" in sample


def classify_upstream_model(model_id: str) -> str:
    lc = str(model_id or "").lower()
    video_keys = ["veo", "sora", "wan2", "wanx", "doubao-seedance", "video", "t2v-", "i2v-"]
    if any(k in lc for k in video_keys):
        return "video"
    image_keys = ["banana", "image", "dalle", "flux", "stable", "sdxl", "midjourney", "nano-banana", "seedream"]
    if any(k in lc for k in image_keys):
        return "image"
    return "chat"


def parse_upstream_models(raw: dict, protocol: str = "openai"):
    items = raw.get("data") if isinstance(raw, dict) else None
    if not items and isinstance(raw, dict):
        items = raw.get("models") or raw.get("list") or []
    if not isinstance(items, list):
        items = []
    ids = []
    for item in items:
        if isinstance(item, str):
            mid = item
        elif isinstance(item, dict):
            mid = item.get("id") or item.get("name") or item.get("model")
        else:
            mid = ""
        if mid:
            mid = str(mid)
            if protocol == "gemini" and mid.startswith("models/"):
                mid = mid[len("models/") :]
            ids.append(mid)
    ids = sorted(set(ids))
    grouped = {"image": [], "chat": [], "video": []}
    for mid in ids:
        grouped[classify_upstream_model(mid)].append(mid)
    return grouped, ids

from backend.services.runninghub_service import runninghub_api_key, runninghub_openapi_url


def runninghub_model_id(item) -> str:
    if not isinstance(item, dict):
        return ""
    return str(item.get("name_en") or item.get("id") or item.get("name") or item.get("endpoint") or "").strip()


def runninghub_registry_model_from_id(model_id: str, output_type: str = ""):
    model_id = str(model_id or "").strip()
    if not model_id:
        return None
    output_type = str(output_type or "").strip().lower() or classify_upstream_model(model_id)
    return {"name_en": model_id, "endpoint": model_id, "output_type": output_type}


def runninghub_registry_fallback():
    image = [
        {"name_en": "gpt-image-2.0/text-to-image-channel-low-price", "endpoint": "rhart-image-g-2/text-to-image", "output_type": "image"},
        {"name_en": "gpt-image-2.0/edit-channel-low-price", "endpoint": "rhart-image-g-2/image-to-image", "output_type": "image"},
        {"name_en": "gpt-image-2/text-to-image-official-stable", "endpoint": "rhart-image-g-2-official/text-to-image", "output_type": "image"},
        {"name_en": "gpt-image-2/image-to-image-official-stable", "endpoint": "rhart-image-g-2-official/image-to-image", "output_type": "image"},
        {"name_en": "nano-banana/text-to-image-official-stable", "endpoint": "rhart-image-v1-official/text-to-image", "output_type": "image"},
        {"name_en": "nano-banana/edit-official-stable", "endpoint": "rhart-image-v1-official/edit", "output_type": "image"},
    ]
    video = [
        {"name_en": "google/veo3.1-fast/text-to-video-channel-low-price", "endpoint": "rhart-video-v3.1-fast/text-to-video", "output_type": "video"},
        {"name_en": "sora-2/text-to-video-official-stable", "endpoint": "rhart-video-s-official/text-to-video", "output_type": "video"},
        {"name_en": "seedance-2.0-global/text-to-video", "endpoint": "bytedance/seedance-2.0-global/text-to-video", "output_type": "video"},
        {"name_en": "seedance-2.0-global/image-to-video", "endpoint": "bytedance/seedance-2.0-global/image-to-video", "output_type": "video"},
    ]
    return image + video


def runninghub_registry_items_from_raw(raw):
    candidates = [raw]
    if isinstance(raw, dict):
        candidates.extend([
            raw.get("data"),
            raw.get("models"),
            raw.get("list"),
            raw.get("items"),
            raw.get("records"),
            raw.get("result"),
        ])
    for candidate in candidates:
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]
        if isinstance(candidate, dict):
            nested = (
                candidate.get("models")
                or candidate.get("list")
                or candidate.get("items")
                or candidate.get("records")
                or candidate.get("data")
            )
            if isinstance(nested, list):
                return [item for item in nested if isinstance(item, dict)]
    return []


def runninghub_api_headers(provider):
    from backend.services.api_providers_service import bearer_auth_value

    api_key = runninghub_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 RunningHub API Key，请在 API 设置中填写。")
    return {"Authorization": bearer_auth_value(api_key), "Accept": "application/json", "Content-Type": "application/json"}


async def fetch_runninghub_llm_models(provider=None):
    headers = runninghub_api_headers(provider)
    errors = []
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for url in RUNNINGHUB_LLM_MODELS_URLS:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code >= 400 or looks_like_html_response(resp.text):
                    errors.append(f"{url}: HTTP {resp.status_code} {resp.text[:180]}")
                    continue
                raw = resp.json() if resp.text else {}
                grouped, ids = parse_upstream_models(raw, "openai")
                if ids:
                    return [runninghub_registry_model_from_id(mid, "chat") for mid in ids], {"source": url, "count": len(ids)}
                errors.append(f"{url}: empty")
            except Exception as exc:
                errors.append(f"{url}: {str(exc)[:180]}")
    return [], {"source": "", "count": 0, "errors": errors[-3:]}


async def fetch_runninghub_model_registry(provider=None, include_fallback=True, include_meta=False):
    urls = [
        ("openapi", runninghub_openapi_url(provider, "models")),
        ("github", RUNNINGHUB_MODEL_REGISTRY_URL),
    ]
    if STATIC_RUNNINGHUB_MODEL_REGISTRY_FILE.exists():
        urls.append(("local", str(STATIC_RUNNINGHUB_MODEL_REGISTRY_FILE)))
    errors = []
    source = ""
    items = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for source_name, url in urls:
            try:
                if source_name == "local":
                    with open(url, "r", encoding="utf-8") as f:
                        raw = json.load(f)
                else:
                    req_headers = runninghub_api_headers(provider) if source_name == "openapi" else {"Accept": "application/json"}
                    resp = await client.get(url, headers=req_headers)
                    if resp.status_code >= 400 or looks_like_html_response(resp.text):
                        errors.append(f"{source_name}: HTTP {resp.status_code} {resp.text[:180]}")
                        continue
                    raw = resp.json() if resp.text else []
                parsed = runninghub_registry_items_from_raw(raw)
                if parsed:
                    items = parsed
                    source = source_name
                    break
                errors.append(f"{source_name}: empty")
            except HTTPException:
                errors.append(f"{source_name}: missing api key")
            except Exception as exc:
                errors.append(f"{source_name}: {str(exc)[:180]}")
                continue
    llm_items, llm_meta = [], {"source": "", "count": 0, "errors": []}
    try:
        llm_items, llm_meta = await fetch_runninghub_llm_models(provider)
    except HTTPException:
        pass
    combined = [*items]
    seen = {runninghub_model_id(item) for item in combined if runninghub_model_id(item)}
    for item in llm_items:
        mid = runninghub_model_id(item)
        if mid and mid not in seen:
            combined.append(item)
            seen.add(mid)
    if combined:
        meta = {
            "source": source or "llm",
            "openapi_count": len(items),
            "llm_count": len(llm_items),
            "llm_source": llm_meta.get("source") or "",
            "errors": [*errors[-3:], *((llm_meta.get("errors") or [])[-3:])],
        }
        return (combined, meta) if include_meta else combined
    if include_fallback:
        fallback = runninghub_registry_fallback()
        meta = {
            "source": "fallback",
            "openapi_count": 0,
            "llm_count": 0,
            "llm_source": "",
            "errors": [*errors[-3:], *((llm_meta.get("errors") or [])[-3:])],
        }
        return (fallback, meta) if include_meta else fallback
    raise HTTPException(status_code=502, detail=f"拉取 RunningHub 模型注册表失败：{'; '.join(errors[-4:]) or 'unknown error'}")


def runninghub_registry_payload(items):
    grouped = {"image": [], "chat": RUNNINGHUB_FALLBACK_CHAT_MODELS[:], "video": []}
    all_ids = []
    for item in items or []:
        mid = runninghub_model_id(item)
        if not mid:
            continue
        output_type = str(item.get("output_type") or item.get("outputType") or "").strip().lower()
        if output_type in ("image", "video"):
            grouped[output_type].append(mid)
            all_ids.append(mid)
    for model in RUNNINGHUB_DEFAULT_IMAGE_MODELS:
        if model not in grouped["image"]:
            grouped["image"].append(model)
            all_ids.append(model)
    for model in RUNNINGHUB_DEFAULT_VIDEO_MODELS:
        if model not in grouped["video"]:
            grouped["video"].append(model)
            all_ids.append(model)
    for model in RUNNINGHUB_FALLBACK_CHAT_MODELS:
        if model not in all_ids:
            all_ids.append(model)
    for key in grouped:
        grouped[key] = sorted(set(grouped[key]))
    return {
        "total": len(set(all_ids)),
        "image_models": grouped["image"],
        "chat_models": grouped["chat"],
        "video_models": grouped["video"],
        "all": sorted(set(all_ids)),
        "protocol": "runninghub",
    }


async def runninghub_models_payload(provider=None):
    registry, meta = await fetch_runninghub_model_registry(provider, include_fallback=True, include_meta=True)
    payload = runninghub_registry_payload(registry)
    payload["raw"] = {"registry_count": len(registry), **meta}
    if meta.get("source") == "fallback":
        payload["message"] = "RunningHub 模型接口未返回完整列表，当前显示内置兜底模型。"
    else:
        payload["message"] = f"RunningHub 模型列表来自 {meta.get('source')}"
    return payload
