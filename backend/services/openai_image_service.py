import os
import re

import httpx
from fastapi import HTTPException

from backend.services.chat_service import AI_REQUEST_TIMEOUT, api_headers, is_apimart_provider
from backend.services.image_params_service import is_gpt_image_2_model

SUPPORTED_IMAGE_REQUEST_MODES = {"openai", "openai-json", "openai-video-proxy", "openai-responses"}


def normalize_image_request_mode(value: str) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in SUPPORTED_IMAGE_REQUEST_MODES else "openai"


def detect_image_request_mode(base_url: str = "", models=None) -> str:
    base = str(base_url or "").strip().lower()
    if "apihub.agnes-ai.com" in base:
        return "openai-json"
    for model in models or []:
        if str(model or "").strip().lower().startswith("agnes-image-"):
            return "openai-json"
    return ""


def effective_image_request_mode(provider: dict, model: str = "") -> str:
    detected = detect_image_request_mode((provider or {}).get("base_url"), [model])
    if detected:
        return detected
    return normalize_image_request_mode((provider or {}).get("image_request_mode"))


def _parse_size_pair(size: str) -> tuple[int, int]:
    match = re.search(r"(\d+)\s*[xX×*]\s*(\d+)", str(size or ""))
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))


def gpt_image_2_size_error_message(size: str) -> str:
    return f"GPT-Image-2 不支持当前尺寸 {size or '未指定'}。请切换到 nano-banana，或调低分辨率后重试。"


def gpt_image_2_size_exceeds_supported(size: str) -> bool:
    width, height = _parse_size_pair(size)
    if not width or not height:
        return str(size or "").strip().lower() in {"4k", "4096x4096"}
    return max(width, height) > 3840 or width * height > 8_294_400


def friendly_image_error_detail(text: str, size: str = "", model: str = "") -> str:
    text = str(text or "")
    lower_text = text.lower()
    if is_gpt_image_2_model(model) and gpt_image_2_size_exceeds_supported(size):
        return gpt_image_2_size_error_message(size)
    mentions_size = any(token in lower_text for token in ["size", "resolution", "dimension"])
    is_gpt_size_error = is_gpt_image_2_model(model) and mentions_size and (
        "invalid" in lower_text or "unsupported" in lower_text or "not supported" in lower_text or "exceed" in lower_text or "must be one of" in lower_text
    )
    m = re.search(r"longest edge must be less than or equal to (\d+)", text)
    if m and is_gpt_image_2_model(model):
        return f"GPT-Image-2 不支持当前尺寸 {size or '未指定'}：最长边超过 {m.group(1)}px。如需更高分辨率请切换 nano-banana。"
    if m:
        return f"该模型不支持当前分辨率：最长边超过 {m.group(1)}px。请调低分辨率或更换模型。"
    if "image size must be at least" in lower_text:
        pixel_match = re.search(r"at least (\d+) pixels", lower_text)
        pixels = pixel_match.group(1) if pixel_match else "3686400"
        return f"该模型要求更高分辨率，当前尺寸 {size or '过小'} 不满足最低像素要求（至少 {pixels} 像素）。"
    if is_gpt_size_error or (("invalid size" in lower_text or "invalid_value" in lower_text) and is_gpt_image_2_model(model)):
        return gpt_image_2_size_error_message(size)
    if "invalid size" in lower_text or "invalid_value" in lower_text:
        return f"该模型不支持当前尺寸：{size or '未指定'}。请尝试更换分辨率或模型。"
    if "inputtextsensitivecontentdetected" in lower_text or "policyviolation" in lower_text or "copyright restrictions" in lower_text:
        return "上游内容安全拦截了这段提示词。请改写提示词，避免具体 IP、角色名、品牌名等。"
    if "rejected by the safety system" in lower_text or "safety system" in lower_text or "content_policy_violation" in lower_text:
        return "上游内容安全系统拒绝了本次生图请求。请改写提示词或更换参考图。"
    if "rate limit" in lower_text or "429" in lower_text:
        return "请求过于频繁，已被上游限流，请稍后再试。"
    if "unauthorized" in lower_text or "401" in lower_text:
        return "API Key 无效或已过期，请到「API 设置」检查 Key。"
    if "model_not_found" in lower_text or "channel not found" in lower_text:
        return f"上游平台找不到模型「{model}」可用通道。请换一个已开通的模型。"
    return ""


def images_api_unsupported(response: httpx.Response) -> bool:
    text = (response.text or "").lower()
    return "images api" in text and "unsupported" in text


async def generate_openai_provider_image(prompt, size, quality, model, reference_images=None, provider=None):
    from backend.services.canvas_llm_media_service import reference_to_data_url
    from backend.services.image_params_service import ONLINE_IMAGE_REFERENCE_MAX
    from backend.services.media_paths import content_type_for_path, output_file_from_url
    from backend.services.online_image_service import (
        apimart_size_resolution,
        extract_image,
        extract_task_id,
        provider_endpoint_url,
        wait_for_image_task,
    )

    provider = provider or {}
    base_url = str(provider.get("base_url") or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider.get('id')} 未配置 Base URL")
    gen_url = provider_endpoint_url(provider, "image_generation_endpoint", "/v1/images/generations")
    edit_url = provider_endpoint_url(provider, "image_edit_endpoint", "/v1/images/edits")
    quality = str(quality or "").strip().lower()
    if quality not in {"low", "medium", "high"}:
        quality = ""
    refs = [ref for ref in (reference_images or []) if ref.get("url")]
    mask_refs = [ref for ref in refs if str(ref.get("role") or "").strip().lower() == "mask" or str(ref.get("name") or "").lower().endswith("_mask.png")]
    image_refs = [ref for ref in refs if ref not in mask_refs]
    image_request_mode = effective_image_request_mode(provider, model)
    is_gpt2 = is_gpt_image_2_model(model)
    is_apimart = is_apimart_provider(provider)
    request_timeout = httpx.Timeout(connect=20.0, read=1800.0, write=120.0, pool=20.0) if (is_gpt2 or is_apimart or image_request_mode in {"openai-json", "openai-video-proxy", "openai-responses"}) else AI_REQUEST_TIMEOUT
    async with httpx.AsyncClient(timeout=request_timeout) as client:
        response = None

        async def post_openai_edits(edit_files=None):
            data = {"model": model, "prompt": prompt, "size": size}
            if quality:
                data["quality"] = quality
            return await client.post(edit_url, headers=api_headers(json_body=False, provider=provider, model=model), data=data, files=edit_files if edit_files is not None else {})

        if image_request_mode == "openai-json":
            extra_body = {"response_format": "url"}
            if image_refs:
                extra_body["image"] = [reference_to_data_url(ref, max_size=1536) for ref in image_refs[:ONLINE_IMAGE_REFERENCE_MAX]]
            body = {"model": model, "prompt": prompt, "size": size, "extra_body": extra_body}
            response = await client.post(gen_url, headers=api_headers(provider=provider, model=model), json=body)
        elif is_apimart:
            apimart_size, resolution = apimart_size_resolution(size)
            body = {"model": model, "prompt": prompt, "n": 1, "size": apimart_size, "resolution": resolution, "official_fallback": False}
            if image_refs:
                body["image_urls"] = [reference_to_data_url(ref, max_size=1536) for ref in image_refs[:ONLINE_IMAGE_REFERENCE_MAX]]
            response = await client.post(gen_url, headers=api_headers(provider=provider, model=model), json=body)
        elif is_gpt2 and not image_refs and not mask_refs:
            body = {"model": model, "prompt": prompt, "size": size}
            if quality:
                body["quality"] = quality
            response = await client.post(gen_url, headers=api_headers(provider=provider, model=model), json=body)
            if response.status_code >= 400 and images_api_unsupported(response):
                response = await post_openai_edits()
        elif image_refs:
            files = []
            opened = []
            edit_failed_text = ""
            try:
                for ref in image_refs[:ONLINE_IMAGE_REFERENCE_MAX]:
                    path = output_file_from_url(ref.get("url", ""))
                    if not path:
                        continue
                    fh = open(path, "rb")
                    opened.append(fh)
                    files.append(("image", (os.path.basename(path), fh, content_type_for_path(path))))
                if mask_refs:
                    mask_path = output_file_from_url(mask_refs[0].get("url", ""))
                    if mask_path:
                        fh = open(mask_path, "rb")
                        opened.append(fh)
                        files.append(("mask", (os.path.basename(mask_path), fh, content_type_for_path(mask_path))))
                response = await post_openai_edits(files)
                if response.status_code >= 400:
                    edit_failed_text = response.text[:500]
                    response = None
            finally:
                for fh in opened:
                    fh.close()
            if response is None:
                if is_gpt2:
                    raise HTTPException(status_code=502, detail=f"GPT-Image-2 编辑接口失败：{edit_failed_text[:300]}")
                image_payload = [reference_to_data_url(ref, max_size=1536) for ref in image_refs[:ONLINE_IMAGE_REFERENCE_MAX]]
                body = {"model": model, "prompt": prompt, "size": size, "response_format": "url", "n": 1, "image": image_payload}
                if quality:
                    body["quality"] = quality
                response = await client.post(gen_url, headers=api_headers(provider=provider, model=model), json=body)
        else:
            body = {"model": model, "prompt": prompt, "size": size, "response_format": "url", "n": 1}
            if quality:
                body["quality"] = quality
            response = await client.post(gen_url, headers=api_headers(provider=provider, model=model), json=body)
            if response.status_code >= 400 and images_api_unsupported(response):
                response = await post_openai_edits()
        response.raise_for_status()
        raw = response.json()
        try:
            return extract_image(raw), raw
        except HTTPException:
            task_id = extract_task_id(raw)
            if not task_id:
                raise
            task_result = await wait_for_image_task(client, task_id, provider)
            return extract_image(task_result), task_result
