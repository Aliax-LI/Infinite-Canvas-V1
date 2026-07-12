import asyncio
import base64
import json
import os
import re
import time
import urllib.parse
import uuid
from threading import Lock
from typing import Any

import httpx
from fastapi import HTTPException

from backend.models.generate import ImageTaskQueryRequest, OnlineImageRequest
from backend.services.ai_config_service import IMAGE_MODEL, modelscope_api_key, modelscope_image_api_root
from backend.services.api_providers_service import get_api_provider, provider_env_key_value
from backend.services.chat_service import (
    AI_REQUEST_TIMEOUT,
    api_headers,
    effective_protocol,
    is_apimart_provider,
    is_codex_provider,
    is_gemini_cli_provider,
    is_volcengine_provider,
    selected_model,
)
from backend.services.history_service import append_history_record
from backend.services.image_params_service import ONLINE_IMAGE_REFERENCE_MAX, is_runninghub_provider
from backend.services.jimeng_cli_service import JimengPendingError, jimeng_pending_payload, save_ai_image_to_output
from backend.services.media_paths import content_type_for_path, output_file_from_url, rewrite_runninghub_file_url
from backend.services.ms_generate_service import modelscope_size
from backend.services.runninghub_service import (
    runninghub_api_key,
    runninghub_app_headers,
    runninghub_endpoint_url,
    runninghub_extract_outputs,
    runninghub_fail_reason,
    runninghub_store_remote_output,
)

CANVAS_TASKS: dict[str, dict[str, Any]] = {}
CANVAS_TASK_LOCK = Lock()

IMAGE_TASK_TIMEOUT = float(os.getenv("IMAGE_TASK_TIMEOUT", str(AI_REQUEST_TIMEOUT)))
IMAGE_POLL_INTERVAL = float(os.getenv("IMAGE_POLL_INTERVAL", "2"))
IMAGE_TASK_SUCCESS_STATUSES = {"SUCCESS", "SUCCESSFUL", "SUCCEED", "SUCCEEDED", "COMPLETED", "COMPLETE", "DONE", "FINISHED", "OK", "READY"}
IMAGE_TASK_FAILED_STATUSES = {"FAILURE", "FAILED", "FAIL", "ERROR", "ERRORED", "CANCELED", "CANCELLED", "TIMEOUT", "REJECTED", "EXPIRED"}

IMAGE_OUTPUT_KEY_HINTS = (
    "url", "image_url", "imageUrl", "image", "output_url", "outputUrl",
    "result_url", "resultUrl", "download_url", "downloadUrl", "asset_url", "assetUrl",
)
IMAGE_CONTAINER_KEY_HINTS = (
    "images", "image", "output", "outputs", "result", "results", "data", "items", "files",
)
IMAGE_BASE64_KEY_HINTS = ("b64_json", "base64", "image_base64", "imageBase64")


def friendly_upstream_http_error(exc: httpx.HTTPError) -> str:
    """Map httpx transport errors to user-facing Chinese messages."""
    text = str(exc).strip()
    lower = text.lower()
    if "server disconnected without sending a response" in lower:
        return (
            "上游生图服务在返回结果前断开连接。"
            "常见于参考图较大或生成耗时较长，请稍后重试或降低分辨率。"
        )
    if "read timeout" in lower or "timed out" in lower:
        return "上游生图请求超时，请降低分辨率/张数或稍后重试。"
    if "connect timeout" in lower or ("connect" in lower and "timeout" in lower):
        return "无法连接上游生图服务，请检查网络与 API Base URL。"
    if "connection reset" in lower or "connection refused" in lower:
        return "与上游生图服务的连接被中断，请稍后重试。"
    return f"请求上游生图接口失败：{text}"


def parse_size_pair(size: str) -> tuple[int, int]:
    match = re.match(r"^\s*(\d{2,5})\s*[xX*]\s*(\d{2,5})\s*$", str(size or ""))
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))


def is_image_reference(ref: dict) -> bool:
    url = str((ref or {}).get("url") or "").strip()
    if not url:
        return False
    if url.startswith("data:image/"):
        return True
    path = output_file_from_url(url) or url
    ext = os.path.splitext(str(path).split("?", 1)[0])[1].lower()
    return ext in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def image_references(refs: list[dict]) -> list[dict]:
    return [ref for ref in (refs or []) if is_image_reference(ref)]


def provider_endpoint_url(provider: dict, field: str, default_path: str) -> str:
    custom = str(provider.get(field) or "").strip()
    if custom:
        return custom
    base = str(provider.get("base_url") or "").rstrip("/")
    if default_path.startswith("http"):
        return default_path
    if base.endswith("/v1") and default_path.startswith("/v1/"):
        return f"{base}{default_path[3:]}"
    return f"{base}{default_path}" if base else default_path


def looks_like_generated_image_url(value: str) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    if text.startswith("data:image/"):
        return True
    clean = text.split("?", 1)[0].split("#", 1)[0].lower()
    return text.startswith(("http://", "https://", "/output/", "/assets/")) and re.search(
        r"\.(png|jpe?g|webp|gif|bmp|tiff?)$", clean
    )


def extract_image_flexible(value, depth: int = 0):
    if depth > 8 or value is None:
        return None
    if isinstance(value, str):
        return {"type": "url", "value": value} if looks_like_generated_image_url(value) else None
    if isinstance(value, list):
        for item in value:
            found = extract_image_flexible(item, depth + 1)
            if found:
                return found
        return None
    if not isinstance(value, dict):
        return None
    for key in IMAGE_BASE64_KEY_HINTS:
        item = value.get(key)
        if isinstance(item, str) and item.strip():
            return {"type": "b64", "value": item.strip(), "mime_type": value.get("mime_type") or value.get("mimeType") or "image/png"}
    for key in IMAGE_OUTPUT_KEY_HINTS:
        item = value.get(key)
        if isinstance(item, str) and looks_like_generated_image_url(item):
            return {"type": "url", "value": item}
        found = extract_image_flexible(item, depth + 1)
        if found:
            return found
    for key in IMAGE_CONTAINER_KEY_HINTS:
        found = extract_image_flexible(value.get(key), depth + 1)
        if found:
            return found
    return None


def extract_images(data):
    found = []
    seen = set()

    def add_image(item):
        if not isinstance(item, dict):
            return
        img_type = item.get("type") or "url"
        value = item.get("value")
        if not value:
            return
        key = (img_type, value)
        if key in seen:
            return
        seen.add(key)
        found.append(item)

    def collect(value, depth=0):
        if depth > 8 or value is None:
            return
        if isinstance(value, str):
            if looks_like_generated_image_url(value):
                add_image({"type": "url", "value": value})
            return
        if isinstance(value, list):
            for item in value:
                collect(item, depth + 1)
            return
        if not isinstance(value, dict):
            return
        for key in IMAGE_BASE64_KEY_HINTS:
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                add_image({"type": "b64", "value": item.strip(), "mime_type": value.get("mime_type") or value.get("mimeType") or "image/png"})
        for key in IMAGE_OUTPUT_KEY_HINTS:
            item = value.get(key)
            if isinstance(item, str) and looks_like_generated_image_url(item):
                add_image({"type": "url", "value": item})
            else:
                collect(item, depth + 1)
        for key in IMAGE_CONTAINER_KEY_HINTS:
            collect(value.get(key), depth + 1)

    collect(data)
    if found:
        return found
    raise HTTPException(status_code=502, detail="无法识别生图接口返回格式")


def extract_image(data):
    try:
        images = extract_images(data)
        if images:
            return images[0]
    except HTTPException:
        pass
    flexible = extract_image_flexible(data)
    if flexible:
        return flexible
    if isinstance(data, dict) and isinstance(data.get("data"), list) and data["data"]:
        first = data["data"][0]
        if isinstance(first, dict):
            if first.get("url"):
                return {"type": "url", "value": first["url"]}
            if first.get("b64_json"):
                return {"type": "b64", "value": first["b64_json"]}
    raise HTTPException(status_code=502, detail="无法识别生图接口返回格式")


def extract_task_id(data):
    if not isinstance(data, dict):
        return None
    for key in ("task_id", "taskId", "submit_id", "video_id", "videoId"):
        if data.get(key):
            return str(data[key])
    if data.get("id") and str(data.get("id", "")).startswith("task"):
        return str(data["id"])
    nested = data.get("data")
    if isinstance(nested, list) and nested and isinstance(nested[0], dict):
        return extract_task_id(nested[0])
    if isinstance(nested, dict):
        return extract_task_id(nested)
    return None


def extract_task_id_from_text(text: str) -> str:
    match = re.search(r"(?:task_id|taskId|task id)\s*[=:：]\s*([A-Za-z0-9_.:-]+)", str(text or ""), re.I)
    return match.group(1) if match else ""


def image_task_url_for_provider(provider: dict, task_id: str) -> str:
    base_url = str(provider.get("base_url") or "").rstrip("/")
    if is_apimart_provider(provider):
        return f"{base_url}/tasks/{task_id}" if base_url.endswith("/v1") else f"{base_url}/v1/tasks/{task_id}"
    return f"{base_url}/images/tasks/{task_id}" if base_url.endswith("/v1") else f"{base_url}/v1/images/tasks/{task_id}"


def image_task_data(payload):
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    return payload if isinstance(payload, dict) else {}


def image_task_status(payload) -> str:
    task_data = image_task_data(payload)
    return str(task_data.get("status") or task_data.get("task_status") or "").upper()


def image_task_fail_reason(payload) -> str:
    task_data = image_task_data(payload)
    error = task_data.get("error") if isinstance(task_data.get("error"), dict) else {}
    return (
        task_data.get("fail_reason")
        or task_data.get("message")
        or error.get("message")
        or (payload.get("message") if isinstance(payload, dict) else "")
        or "生图任务失败"
    )


def image_output_meta(url: str, source_item=None) -> dict:
    meta = {"url": url, "kind": "image"}
    if url:
        meta["name"] = os.path.basename(str(url).split("?", 1)[0]) or "image"
    if isinstance(source_item, dict):
        for key in ("natural_w", "natural_h", "width", "height"):
            try:
                value = int(float(source_item.get(key) or 0))
            except (TypeError, ValueError):
                value = 0
            if value > 0:
                meta[key] = value
    return meta


async def fetch_image_task_payload(client, task_id: str, provider: dict | None = None):
    task_url = image_task_url_for_provider(provider or {}, task_id)
    response = await client.get(task_url, headers=api_headers(provider=provider))
    response.raise_for_status()
    return response.json()


async def wait_for_image_task(client, task_id: str, provider: dict | None = None):
    deadline = time.monotonic() + IMAGE_TASK_TIMEOUT
    last_payload = {}
    while time.monotonic() < deadline:
        last_payload = await fetch_image_task_payload(client, task_id, provider)
        status = image_task_status(last_payload)
        if not status:
            try:
                if extract_image(last_payload):
                    return last_payload
            except HTTPException:
                pass
        if status in IMAGE_TASK_SUCCESS_STATUSES:
            return last_payload
        if status in IMAGE_TASK_FAILED_STATUSES:
            raise HTTPException(status_code=502, detail=f"生图任务失败：{image_task_fail_reason(last_payload)}")
        await asyncio.sleep(min(IMAGE_POLL_INTERVAL, max(0.0, deadline - time.monotonic())))
    raw_text = json.dumps(last_payload, ensure_ascii=False)[:800] if last_payload else ""
    raise HTTPException(status_code=504, detail=f"生图任务超时（已等待 {int(IMAGE_TASK_TIMEOUT)} 秒），task_id={task_id}，最后响应：{raw_text}")


def is_jimeng_provider(provider: dict) -> bool:
    provider_id = str((provider or {}).get("id") or "").strip().lower()
    return provider_id == "jimeng" or str((provider or {}).get("protocol") or "").strip().lower() == "jimeng"


VOLCENGINE_MIN_PIXELS = 3_686_400
VOLCENGINE_MIN_EDGE = 1536
VOLCENGINE_MAX_EDGE = 4096
VOLCENGINE_RATIO_CHOICES = [
    (1, 1), (4, 3), (3, 4), (16, 9), (9, 16), (21, 9), (9, 21), (3, 2), (2, 3), (5, 4), (4, 5),
]


def is_volcengine_seedream_model(model: str) -> bool:
    value = str(model or "").strip().lower()
    return "seedream" in value or "doubao-seedream" in value


def normalize_volcengine_size(size: str, model: str = "") -> str:
    width, height = parse_size_pair(size)
    raw = str(size or "").strip().lower()
    if not width or not height:
        if raw == "4k":
            return "4096x4096"
        if raw == "2k":
            return "2048x2048"
        return "2048x2048" if is_volcengine_seedream_model(model) else (size or "1024x1024")
    if not is_volcengine_seedream_model(model):
        return f"{width}x{height}"
    ratio = width / max(1, height)
    best_ratio = min(VOLCENGINE_RATIO_CHOICES, key=lambda item: abs(ratio - item[0] / item[1]))
    rw, rh = best_ratio[0], best_ratio[1]
    scale = max((VOLCENGINE_MIN_PIXELS / max(1, rw * rh)) ** 0.5, VOLCENGINE_MIN_EDGE / max(1, min(rw, rh)))
    target_w = rw * scale
    target_h = rh * scale
    cap = min(1.0, VOLCENGINE_MAX_EDGE / max(target_w, target_h))
    target_w *= cap
    target_h *= cap
    snapped_w = max(64, int(target_w // 16) * 16)
    snapped_h = max(64, int(target_h // 16) * 16)
    while snapped_w * snapped_h < VOLCENGINE_MIN_PIXELS:
        if snapped_w <= snapped_h:
            snapped_w += 16
        else:
            snapped_h += 16
        if max(snapped_w, snapped_h) > VOLCENGINE_MAX_EDGE:
            break
    return f"{snapped_w}x{snapped_h}"


def apimart_size_resolution(size: str) -> tuple[str, str]:
    width, height = parse_size_pair(size)
    if not width or not height:
        raw = str(size or "").strip().lower()
        if raw in {"1k", "2k", "4k"}:
            return "1:1", raw
        if re.fullmatch(r"(auto|\d+\s*:\s*\d+)", raw):
            return raw.replace(" ", ""), "1k"
        return "1:1", "1k"
    long_edge = max(width, height)
    pixels = width * height
    if long_edge >= 3000 or pixels > 4_500_000:
        resolution = "4k"
    elif long_edge >= 1800 or pixels > 1_800_000:
        resolution = "2k"
    else:
        resolution = "1k"
    common = [
        (1, 1, "1:1"), (3, 2, "3:2"), (2, 3, "2:3"), (4, 3, "4:3"), (3, 4, "3:4"),
        (5, 4, "5:4"), (4, 5, "4:5"), (16, 9, "16:9"), (9, 16, "9:16"),
        (2, 1, "2:1"), (1, 2, "1:2"), (3, 1, "3:1"), (1, 3, "1:3"),
        (21, 9, "21:9"), (9, 21, "9:21"),
    ]
    ratio = width / height
    best = min(common, key=lambda item: abs(ratio - item[0] / item[1]))
    return best[2], resolution


def gemini_model_name(model: str) -> str:
    value = selected_model(model, "gemini-3-pro-image-preview").strip()
    return value[len("models/"):] if value.startswith("models/") else value


def gemini_endpoint_url(provider: dict, model: str) -> str:
    model_name = urllib.parse.quote(gemini_model_name(model), safe="")
    return provider_endpoint_url(provider, "image_generation_endpoint", f"/v1beta/models/{model_name}:generateContent")


def gemini_image_config(size: str) -> dict:
    width, height = parse_size_pair(size)
    if not width or not height:
        raw = str(size or "").strip().upper()
        if raw in {"1K", "2K", "4K"}:
            return {"aspectRatio": "1:1", "imageSize": raw}
        if re.fullmatch(r"\d+\s*:\s*\d+", raw):
            return {"aspectRatio": raw.replace(" ", ""), "imageSize": "1K"}
        return {"aspectRatio": "1:1", "imageSize": "2K"}
    aspect_ratio, resolution = apimart_size_resolution(size)
    return {"aspectRatio": aspect_ratio, "imageSize": resolution.upper()}


def gemini_reference_part(ref: dict) -> dict | None:
    from backend.services.canvas_llm_media_service import reference_to_data_url

    value = reference_to_data_url(ref, max_size=1536)
    if not value:
        return None
    if isinstance(value, str) and value.startswith("data:image/") and ";base64," in value:
        header, encoded = value.split(";base64,", 1)
        mime_type = header.replace("data:", "", 1) or "image/png"
        return {"inlineData": {"mimeType": mime_type, "data": encoded}}
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return {"fileData": {"mimeType": "image/png", "fileUri": value}}
    return None


async def generate_gemini_provider_image(prompt, size, model, reference_images=None, provider=None):
    model_name = gemini_model_name(model)
    endpoint = gemini_endpoint_url(provider or {}, model_name)
    parts = [{"text": prompt.strip()}]
    for ref in (reference_images or [])[:ONLINE_IMAGE_REFERENCE_MAX]:
        part = gemini_reference_part(ref)
        if part:
            parts.append(part)
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": gemini_image_config(size),
        },
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=1800.0, write=120.0, pool=20.0)) as client:
        response = await client.post(endpoint, headers=api_headers(provider=provider, model=model), json=body)
        response.raise_for_status()
        raw = response.json()
        return extract_image(raw), raw


def volcengine_endpoint_url(provider: dict) -> str:
    return provider_endpoint_url(provider, "image_generation_endpoint", "/api/v3/images/generations")


def volcengine_image_payload(ref: dict) -> str | None:
    from backend.services.canvas_llm_media_service import reference_to_data_url

    value = reference_to_data_url(ref, max_size=1536)
    return value or None


async def generate_volcengine_provider_image(prompt, size, model, reference_images=None, provider=None):
    endpoint = volcengine_endpoint_url(provider or {})
    normalized_size = normalize_volcengine_size(size, model)
    body = {
        "model": model,
        "prompt": prompt,
        "size": normalized_size,
        "response_format": "url",
    }
    images = [volcengine_image_payload(ref) for ref in (reference_images or [])[:ONLINE_IMAGE_REFERENCE_MAX]]
    images = [value for value in images if value]
    if images:
        body["image"] = images
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=1800.0, write=120.0, pool=20.0)) as client:
        response = await client.post(endpoint, headers=api_headers(provider=provider, model=model), json=body)
        response.raise_for_status()
        raw = response.json()
        return extract_image(raw), raw


async def generate_modelscope_provider_image(prompt, size, model, reference_images=None, provider=None):
    from backend.services.ms_generate_service import modelscope_image_url

    clean_token = modelscope_api_key()
    if not clean_token:
        raise HTTPException(status_code=400, detail="未配置 ModelScope API Key，请在 API 设置中填写。")
    width, height = parse_size_pair(size)
    refs = []
    for ref in (reference_images or [])[:ONLINE_IMAGE_REFERENCE_MAX]:
        url = str(ref.get("url") or "").strip()
        if not url:
            continue
        refs.append(modelscope_image_url(url, max_size=1536))
    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true",
    }
    payload = {"model": selected_model(model, "Tongyi-MAI/Z-Image-Turbo"), "prompt": prompt.strip()}
    if width and height:
        payload["width"] = width
        payload["height"] = height
        payload["size"] = f"{width}x{height}"
    if refs:
        payload["image_url"] = refs
    api_root = modelscope_image_api_root()
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        submit_res = await client.post(f"{api_root}/images/generations", headers=headers, json=payload)
        submit_res.raise_for_status()
        raw = submit_res.json()
        task_id = raw.get("task_id")
        if not task_id:
            return extract_image(raw), raw
        deadline = time.monotonic() + IMAGE_TASK_TIMEOUT
        last_payload = raw
        while time.monotonic() < deadline:
            await asyncio.sleep(IMAGE_POLL_INTERVAL)
            result = await client.get(
                f"{api_root}/tasks/{task_id}",
                headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
            )
            result.raise_for_status()
            data = result.json()
            last_payload = data
            status = str(data.get("task_status") or "").upper()
            if status == "SUCCEED":
                images = data.get("output_images") or []
                if not images:
                    raise HTTPException(status_code=502, detail=f"ModelScope 成功但没有返回图片：{data}")
                return {"type": "url", "value": images[0]}, data
            if status in IMAGE_TASK_FAILED_STATUSES:
                detail = data.get("error_info") or data.get("message") or data.get("detail") or str(data)
                raise HTTPException(status_code=502, detail=f"ModelScope 任务失败：{detail}")
        raise HTTPException(status_code=504, detail=f"ModelScope 生图任务超时：{last_payload}")


async def generate_ai_image(prompt, size, quality, model, reference_images=None, provider_id="comfly"):
    provider = get_api_provider(provider_id)
    if provider["id"] == "modelscope":
        return await generate_modelscope_provider_image(prompt, size, model, reference_images, provider)
    if is_jimeng_provider(provider):
        from backend.services.jimeng_cli_service import generate_jimeng_provider_image
        return await generate_jimeng_provider_image(prompt, size, model, reference_images, provider)
    if is_codex_provider(provider):
        from backend.services.codex_cli_service import generate_codex_provider_image
        return await generate_codex_provider_image(prompt, size, model, reference_images, provider)
    if is_gemini_cli_provider(provider):
        from backend.services.gemini_cli_service import generate_gemini_cli_provider_image
        return await generate_gemini_cli_provider_image(prompt, size, model, reference_images, provider)
    if is_volcengine_provider(provider):
        return await generate_volcengine_provider_image(prompt, size, model, reference_images, provider)
    if is_runninghub_provider(provider):
        from backend.services.runninghub_generate_service import generate_runninghub_provider_image
        return await generate_runninghub_provider_image(prompt, size, model, reference_images, provider)
    if effective_protocol(provider) == "gemini":
        return await generate_gemini_provider_image(prompt, size, model, reference_images, provider)
    from backend.services.openai_image_service import generate_openai_provider_image

    return await generate_openai_provider_image(prompt, size, quality, model, reference_images, provider)


async def build_online_image_result(payload: OnlineImageRequest) -> dict:
    provider = get_api_provider(payload.provider_id)
    default_model = (provider.get("image_models") or [IMAGE_MODEL])[0]
    model = selected_model(payload.model, default_model)
    refs = [ref.model_dump() for ref in payload.reference_images if ref.url]
    image_refs = image_references(refs)
    count = max(1, min(8, int(payload.n or 1)))

    async def generate_one():
        image_data, raw_item = await generate_ai_image(
            payload.prompt, payload.size, payload.quality, model, image_refs, provider["id"]
        )
        try:
            image_items = extract_images(raw_item) if isinstance(raw_item, dict) else [image_data]
        except HTTPException:
            image_items = [image_data]
        local_urls = []
        local_items = []
        for item in image_items:
            local_url = await save_ai_image_to_output(item, prefix="online_")
            if local_url:
                local_urls.append(local_url)
                local_items.append(image_output_meta(local_url, item))
        return local_urls, local_items, raw_item

    try:
        generated = await asyncio.gather(*(generate_one() for _ in range(count)))
    except httpx.HTTPStatusError as exc:
        text = exc.response.text or ""
        from backend.services.openai_image_service import friendly_image_error_detail

        friendly = friendly_image_error_detail(text, payload.size, model)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游生图接口错误：{text[:300]}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=friendly_upstream_http_error(exc)) from exc

    local_urls = [url for urls, _items, _raw in generated for url in (urls or []) if url]
    local_items = [item for _urls, items, _raw in generated for item in (items or []) if item.get("url")]
    raw = generated[0][2] if generated else {}
    if not local_urls:
        provider_name = provider.get("name") or provider["id"]
        raw_text = json.dumps(raw, ensure_ascii=False)[:800] if isinstance(raw, (dict, list)) else str(raw)[:800]
        raise HTTPException(status_code=502, detail=f"{provider_name} 没有返回图片：{raw_text}")
    result = {
        "prompt": payload.prompt,
        "images": local_urls,
        "image_items": local_items,
        "timestamp": time.time(),
        "type": "online",
        "model": model,
        "provider_id": provider["id"],
        "provider_name": provider.get("name") or provider["id"],
        "task_id": extract_task_id(raw) if isinstance(raw, dict) else None,
        "request_id": raw.get("id") if isinstance(raw, dict) else None,
        "params": {
            "provider_id": provider["id"],
            "model": model,
            "size": payload.size,
            "quality": payload.quality,
            "n": count,
            "reference_images": refs,
        },
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }
    append_history_record(result)
    try:
        from backend.services.ws_manager import manager

        asyncio.create_task(manager.broadcast_new_image(result))
    except Exception:
        pass
    return result


async def query_image_task(payload: ImageTaskQueryRequest) -> dict:
    provider = get_api_provider(payload.provider_id)
    task_id = str(payload.task_id or "").strip()
    if is_runninghub_provider(provider):
        api_key = runninghub_api_key(provider)
        url = runninghub_endpoint_url(provider, "/task/openapi/outputs")
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=240.0, write=30.0, pool=20.0)) as client:
                response = await client.post(url, headers=runninghub_app_headers(True), json={"apiKey": api_key, "taskId": task_id})
                response.raise_for_status()
                raw = response.json()
                code = raw.get("code") if isinstance(raw, dict) else None
                if code in (0, "0"):
                    local_urls = []
                    local_items = []
                    for remote in runninghub_extract_outputs(raw.get("data")):
                        try:
                            local_url = await runninghub_store_remote_output(client, remote)
                        except Exception:
                            local_url = rewrite_runninghub_file_url(remote)
                        if local_url:
                            local_urls.append(local_url)
                            local_items.append(image_output_meta(local_url))
                    result = {
                        "status": "succeeded",
                        "prompt": "",
                        "images": local_urls,
                        "image_items": local_items,
                        "timestamp": time.time(),
                        "type": "online",
                        "model": "",
                        "provider_id": provider["id"],
                        "provider_name": provider.get("name") or provider["id"],
                        "task_id": task_id,
                        "request_id": "",
                        "params": {"provider_id": provider["id"]},
                        "raw": raw,
                    }
                    append_history_record(result)
                    return result
                if code in (805, "805"):
                    return {
                        "status": "failed",
                        "task_id": task_id,
                        "provider_id": provider["id"],
                        "provider_name": provider.get("name") or provider["id"],
                        "error": runninghub_fail_reason(raw),
                        "raw": raw,
                    }
                return {
                    "status": "running",
                    "task_id": task_id,
                    "provider_id": provider["id"],
                    "provider_name": provider.get("name") or provider["id"],
                    "message": "RunningHub 任务仍在生成中",
                    "raw": raw,
                }
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"查询 RunningHub 任务失败：{(exc.response.text or '')[:300]}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"查询 RunningHub 任务失败：{exc}") from exc

    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT, follow_redirects=True) as client:
            raw = await fetch_image_task_payload(client, task_id, provider)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"查询上游生图任务失败：{(exc.response.text or '')[:300]}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"查询上游生图任务失败：{exc}") from exc

    status = image_task_status(raw)
    image_items = []
    try:
        image_items = extract_images(raw)
    except HTTPException:
        image_items = []
    if image_items:
        local_urls = []
        local_items = []
        for item in image_items:
            local_url = await save_ai_image_to_output(item, prefix="online_")
            if local_url:
                local_urls.append(local_url)
                local_items.append(image_output_meta(local_url, item))
        result = {
            "status": "succeeded",
            "prompt": "",
            "images": local_urls,
            "image_items": local_items,
            "timestamp": time.time(),
            "type": "online",
            "model": "",
            "provider_id": provider["id"],
            "provider_name": provider.get("name") or provider["id"],
            "task_id": task_id,
            "request_id": raw.get("id") if isinstance(raw, dict) else "",
            "params": {"provider_id": provider["id"]},
            "raw": raw,
        }
        append_history_record(result)
        return result
    if status in IMAGE_TASK_FAILED_STATUSES:
        return {
            "status": "failed",
            "task_id": task_id,
            "provider_id": provider["id"],
            "provider_name": provider.get("name") or provider["id"],
            "error": image_task_fail_reason(raw),
            "raw": raw,
        }
    return {
        "status": "running",
        "task_id": task_id,
        "provider_id": provider["id"],
        "provider_name": provider.get("name") or provider["id"],
        "message": "任务仍在生成中",
        "raw": raw,
    }


async def run_canvas_image_task(task_id: str, payload: OnlineImageRequest) -> None:
    with CANVAS_TASK_LOCK:
        if task_id in CANVAS_TASKS:
            CANVAS_TASKS[task_id]["status"] = "running"
            CANVAS_TASKS[task_id]["updated_at"] = time.time()
    try:
        result = await build_online_image_result(payload)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "succeeded",
                "result": result,
                "error": "",
                "updated_at": time.time(),
            })
    except JimengPendingError as exc:
        info = jimeng_pending_payload(exc)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "jimeng_pending",
                "jimeng_pending": True,
                "submit_id": exc.submit_id,
                "kind": exc.kind,
                "queue_info": exc.queue_info,
                "message": info["message"],
                "error": "",
                "updated_at": time.time(),
            })
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        upstream_task_id = getattr(exc, "upstream_task_id", "") or extract_task_id_from_text(str(detail))
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "failed",
                "error": str(detail),
                "status_code": status_code,
                "upstream_task_id": upstream_task_id,
                "updated_at": time.time(),
            })


def create_canvas_image_task(payload: OnlineImageRequest) -> dict:
    task_id = f"canvas_img_{uuid.uuid4().hex}"
    with CANVAS_TASK_LOCK:
        CANVAS_TASKS[task_id] = {
            "id": task_id,
            "type": "online-image",
            "status": "queued",
            "created_at": time.time(),
            "updated_at": time.time(),
            "result": None,
            "error": "",
            "provider_id": payload.provider_id,
            "model": payload.model,
        }
    asyncio.create_task(run_canvas_image_task(task_id, payload))
    return {"task_id": task_id, "status": "queued"}


def get_canvas_image_task(task_id: str) -> dict:
    with CANVAS_TASK_LOCK:
        task = dict(CANVAS_TASKS.get(task_id) or {})
    if not task:
        raise HTTPException(status_code=404, detail="画布任务不存在，可能服务已重启或任务已过期")
    return task


async def run_canvas_comfy_task(task_id: str, payload) -> None:
    from backend.services.comfy_generate_service import comfy_generate

    with CANVAS_TASK_LOCK:
        if task_id in CANVAS_TASKS:
            CANVAS_TASKS[task_id]["status"] = "running"
            CANVAS_TASKS[task_id]["updated_at"] = time.time()
    try:
        result = await asyncio.to_thread(comfy_generate, payload)
        if isinstance(result, dict) and result.get("error"):
            raise RuntimeError(str(result.get("error") or "ComfyUI 生成失败"))
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "succeeded",
                "result": result,
                "error": "",
                "updated_at": time.time(),
            })
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "failed",
                "error": str(detail),
                "status_code": status_code,
                "updated_at": time.time(),
            })


def create_canvas_comfy_task(payload) -> dict:
    task_id = f"canvas_comfy_{uuid.uuid4().hex}"
    with CANVAS_TASK_LOCK:
        CANVAS_TASKS[task_id] = {
            "id": task_id,
            "type": "comfy",
            "status": "queued",
            "created_at": time.time(),
            "updated_at": time.time(),
            "result": None,
            "error": "",
            "workflow_json": payload.workflow_json,
        }
    asyncio.create_task(run_canvas_comfy_task(task_id, payload))
    return {"task_id": task_id, "status": "queued"}


def get_canvas_comfy_task(task_id: str) -> dict:
    return get_canvas_image_task(task_id)
