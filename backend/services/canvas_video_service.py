import asyncio
import base64
import os
import re
import time
import urllib.parse

import httpx
from fastapi import HTTPException

from backend.models.generate import CanvasVideoRequest
from backend.services.api_providers_service import get_api_provider, provider_env_key_value
from backend.services.chat_service import AI_REQUEST_TIMEOUT, api_headers, is_apimart_provider, is_volcengine_provider, selected_model
from backend.services.cloud_upload_service import upload_local_video_to_cloud
from backend.services.image_params_service import is_runninghub_provider
from backend.services.jimeng_cli_service import save_remote_video_to_output
from backend.services.media_paths import content_type_for_path, output_file_from_url
from backend.services.online_image_service import extract_task_id

VIDEO_POLL_TIMEOUT = float(os.getenv("VIDEO_POLL_TIMEOUT", "1800"))
VIDEO_POLL_INTERVAL = float(os.getenv("VIDEO_POLL_INTERVAL", "3"))
VIDEO_TASK_SUCCESS_STATUSES = {
    "SUCCESS", "SUCCEED", "SUCCEEDED", "COMPLETED", "COMPLETE",
    "DONE", "FINISHED", "FINISH", "OK", "READY",
}
VIDEO_TASK_FAILURE_STATUSES = {
    "FAILURE", "FAILED", "FAIL", "ERROR", "ERRORED",
    "CANCELED", "CANCELLED", "TIMEOUT", "TIMEDOUT", "REJECTED", "EXPIRED",
}
VIDEO_URL_KEYS = (
    "url", "video_url", "videoUrl", "mp4_url", "mp4Url",
    "output", "output_url", "outputUrl", "download_url", "downloadUrl",
    "video", "src", "uri", "preview_url", "previewUrl", "path",
)


def _is_yuli_provider(provider: dict) -> bool:
    return "yuli.host" in str(provider.get("base_url") or "").lower()


def _is_agnes_provider(provider: dict, model: str = "") -> bool:
    base_url = str(provider.get("base_url") or "").lower()
    model_id = str(model or "").strip().lower()
    return "apihub.agnes-ai.com" in base_url or model_id.startswith("agnes-video-")


def _agnes_video_dimensions(aspect_ratio="", resolution=""):
    ratio = str(aspect_ratio or "16:9").strip()
    width, height = {
        "16:9": (1152, 648), "9:16": (648, 1152), "4:3": (1024, 768), "3:4": (768, 1024),
        "1:1": (768, 768), "21:9": (1280, 544), "9:21": (544, 1280),
    }.get(ratio, (1152, 768))
    scale = {"480p": 0.625, "720p": 1.0, "780p": 1.0, "1080p": 1.5}.get(str(resolution or "").strip().lower(), 1.0)
    width = max(64, int(round(width * scale / 8) * 8))
    height = max(64, int(round(height * scale / 8) * 8))
    return width, height


def _agnes_video_frame_count(duration, fps=24):
    try:
        seconds = max(1, min(18, int(duration or 5)))
    except Exception:
        seconds = 5
    try:
        frame_rate = max(1, min(60, int(fps or 24)))
    except Exception:
        frame_rate = 24
    target = min(441, max(9, seconds * frame_rate))
    n = max(1, round((target - 1) / 8))
    return min(441, max(9, 8 * n + 1)), frame_rate


async def _agnes_video_image_url(ref):
    url = str(getattr(ref, "url", "") or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    uploaded = await upload_local_video_to_cloud(url, "auto")
    return uploaded.get("url") or ""


async def _wait_for_agnes_video_task(client, provider, video_id, model):
    base_url = video_api_root(provider)
    query_url = f"{base_url}/agnesapi?{urllib.parse.urlencode({'video_id': video_id, 'model_name': model})}"
    legacy_url = f"{base_url}/v1/videos/{urllib.parse.quote(str(video_id), safe='')}"
    deadline = time.monotonic() + VIDEO_POLL_TIMEOUT
    delay = 5.0
    last_payload = {}
    while time.monotonic() < deadline:
        await asyncio.sleep(delay)
        raw = None
        last_error = None
        for url in (query_url, legacy_url):
            try:
                response = await client.get(url, headers=api_headers(provider=provider, model=model))
                response.raise_for_status()
                raw = response.json()
                break
            except Exception as exc:
                last_error = exc
        if raw is None:
            if last_error:
                raise last_error
            raise HTTPException(status_code=502, detail=f"Agnes 视频任务查询失败：{video_id}")
        last_payload = raw
        task_data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        status = str(task_data.get("status") or raw.get("status") or "").upper()
        if status in VIDEO_TASK_SUCCESS_STATUSES or video_output_urls(raw):
            return raw
        if status in VIDEO_TASK_FAILURE_STATUSES:
            reason = task_data.get("message") or raw.get("error") or str(raw)
            raise HTTPException(status_code=502, detail=f"Agnes 视频生成任务失败：{reason}")
        delay = min(delay * 1.35, 12)
    raise HTTPException(status_code=504, detail=f"Agnes 视频生成任务超时：{last_payload or video_id}")


async def _generate_agnes_video(client, payload, provider, base_url, requested_model):
    model = selected_model(requested_model, "agnes-video-v2.0")
    width, height = _agnes_video_dimensions(payload.aspect_ratio, payload.resolution)
    num_frames, frame_rate = _agnes_video_frame_count(payload.duration, 24)
    body = {"model": model, "prompt": str(payload.prompt or ""), "width": width, "height": height, "num_frames": num_frames, "frame_rate": frame_rate}
    image_urls = []
    image_roles = []
    for ref in (payload.images or [])[:4]:
        url = await _agnes_video_image_url(ref)
        if url:
            image_urls.append(url)
            image_roles.append(str(getattr(ref, "role", "") or "").strip().lower())
    if len(image_urls) == 1:
        body["image"] = image_urls[0]
    elif len(image_urls) > 1:
        body["extra_body"] = {"image": image_urls}
        if payload.multimodal or any(role in {"first_frame", "last_frame"} for role in image_roles):
            body["extra_body"]["mode"] = "keyframes"
    if payload.seed is not None:
        body["seed"] = payload.seed
    submit_url = f"{base_url}/v1/videos"
    response = await client.post(submit_url, headers=api_headers(provider=provider, model=model), json=body)
    response.raise_for_status()
    raw = response.json()
    video_id = str(raw.get("video_id") or "").strip()
    task_id = str(raw.get("task_id") or raw.get("id") or "").strip()
    result = raw
    if video_id and not video_output_urls(raw):
        result = await _wait_for_agnes_video_task(client, provider, video_id, model)
    elif task_id and not video_output_urls(raw):
        result = await wait_for_video_task(client, provider, task_id, submit_url)
    urls = video_output_urls(result)
    if not urls:
        raise HTTPException(status_code=502, detail=f"Agnes 视频生成成功但没有返回视频：{result}")
    local_urls = [await save_remote_video_to_output(url) for url in urls]
    return {"videos": local_urls, "task_id": task_id or video_id, "video_id": video_id or None, "raw": result}


def _yuli_model_norm(model: str) -> str:
    return str(model or "").strip().lower().replace("_", "").replace(".", "").replace("-", "")


def _yuli_is_veo_openai_model(model: str) -> bool:
    return _yuli_model_norm(model) in {"veo31", "veo31fast"}


def _yuli_openai_model_name(model: str) -> str:
    return "veo_3_1-fast" if _yuli_model_norm(model) == "veo31fast" else "veo_3_1"


def _yuli_openai_size(aspect_ratio: str) -> str:
    return "9x16" if str(aspect_ratio or "").strip() == "9:16" else "16x9"


def _yuli_video_seconds(duration) -> str:
    try:
        value = int(duration)
    except Exception:
        value = 8
    return str(value if value > 0 else 8)


async def _yuli_fetch_reference_bytes(client, ref_url):
    ref_url = str(ref_url or "").strip()
    if not ref_url:
        return None
    if ref_url.startswith("data:"):
        header, _, b64 = ref_url.partition(",")
        mime = (header[5:].split(";")[0] or "image/png").strip()
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return None
        ext = (mime.split("/")[-1] or "png").split("+")[0]
        return (f"input_reference.{ext}", raw, mime)
    path = output_file_from_url(ref_url)
    if path:
        try:
            with open(path, "rb") as f:
                raw = f.read()
        except Exception:
            return None
        return (os.path.basename(path) or "input_reference", raw, content_type_for_path(path))
    if ref_url.startswith(("http://", "https://")):
        try:
            resp = await client.get(ref_url)
            resp.raise_for_status()
            mime = (resp.headers.get("content-type") or "image/png").split(";")[0].strip()
            ext = (mime.split("/")[-1] or "png").split("+")[0]
            return (f"input_reference.{ext}", resp.content, mime)
        except Exception:
            return None
    return None


async def _generate_yuli_openai_video(client, payload, provider, base_url, requested_model):
    submit_url = f"{base_url}/v1/videos"
    data = {
        "model": _yuli_openai_model_name(requested_model),
        "prompt": str(payload.prompt or ""),
        "seconds": _yuli_video_seconds(payload.duration),
        "size": _yuli_openai_size(payload.aspect_ratio),
        "watermark": "true" if payload.watermark else "false",
    }
    files = {}
    for ref in (payload.images or [])[:1]:
        ref_file = await _yuli_fetch_reference_bytes(client, getattr(ref, "url", ""))
        if ref_file:
            files["input_reference"] = ref_file
            break
    headers = api_headers(json_body=False, provider=provider)
    if files:
        response = await client.post(submit_url, headers=headers, data=data, files=files)
    else:
        multipart_fields = {key: (None, value) for key, value in data.items()}
        response = await client.post(submit_url, headers=headers, files=multipart_fields)
    response.raise_for_status()
    raw = response.json()
    task_id = raw.get("id") or extract_task_id(raw) or raw.get("task_id")
    result = raw
    if task_id and not video_output_urls(raw):
        result = await wait_for_video_task(client, provider, str(task_id), submit_url)
    urls = video_output_urls(result)
    if not urls:
        raise HTTPException(status_code=502, detail=f"视频生成成功但没有返回视频：{result}")
    local_urls = [await save_remote_video_to_output(url) for url in urls]
    return {"videos": local_urls, "task_id": task_id, "raw": result}


def _is_jimeng_provider(provider: dict) -> bool:
    return str(provider.get("id") or "") == "jimeng" or str(provider.get("protocol") or "") == "jimeng"


def _collect_video_url(value, urls):
    if not value:
        return
    if isinstance(value, str):
        if value.startswith(("http://", "https://", "/output/", "/assets/")):
            urls.append(value)
        return
    if isinstance(value, list):
        for item in value:
            _collect_video_url(item, urls)
        return
    if isinstance(value, dict):
        for key in ("videos", "outputs", "data", "result", "content"):
            if key in value:
                _collect_video_url(value.get(key), urls)
        for key in VIDEO_URL_KEYS:
            if key in value:
                _collect_video_url(value.get(key), urls)


def video_output_urls(raw):
    urls = []
    if not isinstance(raw, dict):
        return urls
    candidates = [raw]
    data = raw.get("data")
    if isinstance(data, dict):
        candidates.append(data)
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                candidates.append(item)
    for node in candidates:
        if not isinstance(node, dict):
            continue
        for key in ("videos", "outputs", "content"):
            if key in node:
                _collect_video_url(node.get(key), urls)
        for key in VIDEO_URL_KEYS:
            if key in node:
                _collect_video_url(node.get(key), urls)
    deduped = []
    for url in urls:
        if isinstance(url, str) and url and url not in deduped:
            deduped.append(url)
    return deduped


def video_api_root(provider: dict) -> str:
    base_url = str(provider.get("base_url") or "").rstrip("/")
    if is_volcengine_provider(provider):
        if base_url.endswith("/api/v3"):
            base_url = base_url[: -len("/api/v3")]
        return base_url
    if base_url.endswith("/v1") or base_url.endswith("/v2"):
        base_url = base_url.rsplit("/", 1)[0]
    return base_url


def video_submit_url_candidates(provider: dict, base_url: str) -> list[str]:
    if is_apimart_provider(provider):
        return [f"{base_url}/videos/generations" if base_url.endswith("/v1") else f"{base_url}/v1/videos/generations"]
    if is_volcengine_provider(provider):
        parsed = urllib.parse.urlparse(base_url)
        if parsed.path and parsed.path.rstrip("/"):
            return [base_url]
        return [f"{base_url}/api/v3/contents/generations/tasks"]
    return [f"{base_url}/v1/videos/generations", f"{base_url}/v2/videos/generations"]


def video_task_url_candidates(provider: dict, base_url: str, task_id: str, submit_url: str = "") -> list[str]:
    if is_apimart_provider(provider):
        task_path = f"{base_url}/tasks/{task_id}" if base_url.endswith("/v1") else f"{base_url}/v1/tasks/{task_id}"
        return [f"{task_path}?language=zh"]
    if is_volcengine_provider(provider):
        parsed = urllib.parse.urlparse(base_url)
        if parsed.path and parsed.path.rstrip("/"):
            return [f"{base_url}/{task_id}"]
        return [f"{base_url}/api/v3/contents/generations/tasks/{task_id}"]
    v1_task = f"{base_url}/v1/videos/generations/{task_id}"
    v1_generic_task = f"{base_url}/v1/tasks/{task_id}"
    v2_task = f"{base_url}/v2/videos/generations/{task_id}"
    if "/v2/videos/generations" in str(submit_url or ""):
        return [v2_task, v1_task, v1_generic_task]
    return [v1_task, v1_generic_task, v2_task]


async def wait_for_video_task(client, provider: dict, task_id: str, submit_url: str = ""):
    from backend.services.canvas_video_advanced_service import (
        generate_agnes_video,
        generate_yuli_openai_video,
        is_agnes_provider,
        is_yuli_provider,
        yuli_is_veo_openai_model,
    )
    base_url = video_api_root(provider)
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider['id']} 未配置 Base URL")
    requested_model = selected_model(payload.model, "agnes-video-v2.0" if is_agnes_provider(provider, payload.model) else "veo3-fast")
    if is_agnes_provider(provider, payload.model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as agnes_client:
                return await generate_agnes_video(agnes_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"Agnes 视频接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求 Agnes 视频接口失败：{exc}") from exc
    if is_yuli_provider(provider) and yuli_is_veo_openai_model(requested_model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as yuli_client:
                return await generate_yuli_openai_video(yuli_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游视频接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游视频接口失败：{exc}") from exc
    task_urls = video_task_url_candidates(provider, base_url, task_id, submit_url)
    deadline = time.monotonic() + VIDEO_POLL_TIMEOUT
    delay = max(2.0, VIDEO_POLL_INTERVAL)
    last_payload = {}
    while time.monotonic() < deadline:
        await asyncio.sleep(delay)
        raw = None
        last_error = None
        for task_url in task_urls:
            try:
                response = await client.get(task_url, headers=api_headers(provider=provider))
                response.raise_for_status()
                raw = response.json()
                break
            except Exception as exc:
                last_error = exc
                continue
        if raw is None:
            if last_error:
                raise last_error
            raise HTTPException(status_code=502, detail=f"视频任务查询失败：{task_id}")
        last_payload = raw
        task_data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        status = str(task_data.get("status") or task_data.get("task_status") or raw.get("status") or raw.get("task_status") or "").upper()
        if status in VIDEO_TASK_SUCCESS_STATUSES:
            return raw
        if status not in VIDEO_TASK_FAILURE_STATUSES and video_output_urls(raw):
            return raw
        if status in VIDEO_TASK_FAILURE_STATUSES:
            error = task_data.get("error") if isinstance(task_data.get("error"), dict) else {}
            reason = task_data.get("fail_reason") or task_data.get("message") or error.get("message") or raw.get("error") or raw.get("message") or str(raw)
            raise HTTPException(status_code=502, detail=f"视频生成任务失败：{reason}")
        delay = min(delay * 1.6, 12)
    raise HTTPException(status_code=504, detail=f"视频生成任务超时：{last_payload or task_id}")


async def canvas_video(payload: CanvasVideoRequest) -> dict:
    provider = get_api_provider(payload.provider_id)
    if _is_jimeng_provider(provider):
        from backend.services.jimeng_cli_service import generate_jimeng_video
        return await generate_jimeng_video(payload, provider)
    if is_runninghub_provider(provider):
        from backend.services.runninghub_generate_service import generate_runninghub_video
        try:
            return await generate_runninghub_video(payload, provider)
        except httpx.HTTPStatusError as exc:
            text = exc.response.text
            raise HTTPException(status_code=exc.response.status_code, detail=f"RunningHub 视频接口错误：{text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求 RunningHub 视频接口失败：{exc}") from exc
    from backend.services.canvas_video_advanced_service import (
        generate_agnes_video,
        generate_yuli_openai_video,
        is_agnes_provider,
        is_yuli_provider,
        yuli_is_veo_openai_model,
    )
    base_url = video_api_root(provider)
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider['id']} 未配置 Base URL")
    requested_model = selected_model(payload.model, "agnes-video-v2.0" if is_agnes_provider(provider, payload.model) else "veo3-fast")
    if is_agnes_provider(provider, payload.model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as agnes_client:
                return await generate_agnes_video(agnes_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"Agnes 视频接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求 Agnes 视频接口失败：{exc}") from exc
    if is_yuli_provider(provider) and yuli_is_veo_openai_model(requested_model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as yuli_client:
                return await generate_yuli_openai_video(yuli_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游视频接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游视频接口失败：{exc}") from exc
    if not provider_env_key_value(provider["id"]):
        raise HTTPException(status_code=400, detail=f"未配置 {provider.get('name') or provider['id']} 的 API Key，请在 API 设置中填写。")
    requested_model = selected_model(payload.model, "veo3-fast")
    if _is_agnes_provider(provider, payload.model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as agnes_client:
                return await _generate_agnes_video(agnes_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"Agnes 视频接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求 Agnes 视频接口失败：{exc}") from exc
    if _is_yuli_provider(provider) and _yuli_is_veo_openai_model(requested_model):
        try:
            async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as yuli_client:
                return await _generate_yuli_openai_video(yuli_client, payload, provider, base_url, requested_model)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游视频接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游视频接口失败：{exc}") from exc
    submit_urls = video_submit_url_candidates(provider, base_url)
    image_payload = [ref.url for ref in (payload.images or []) if ref.url][:4]
    body = {
        "prompt": payload.prompt,
        "model": requested_model,
        "duration": payload.duration,
        "watermark": payload.watermark,
    }
    if payload.aspect_ratio:
        body["aspect_ratio"] = payload.aspect_ratio
        body["ratio"] = payload.aspect_ratio
    if payload.size:
        body["size"] = payload.size
    if payload.resolution:
        body["resolution"] = payload.resolution
    if image_payload:
        body["images"] = image_payload
    if payload.videos:
        body["videos"] = [v for v in payload.videos if v]
    if payload.enhance_prompt:
        body["enhance_prompt"] = True
    if payload.enable_upsample:
        body["enable_upsample"] = True
    if payload.seed is not None:
        body["seed"] = payload.seed
    if payload.camerafixed:
        body["camerafixed"] = True
    if payload.return_last_frame:
        body["return_last_frame"] = True
    if payload.generate_audio:
        body["generate_audio"] = True

    async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as client:
        raw = None
        submit_url = submit_urls[0]
        last_response = None
        for idx, candidate_url in enumerate(submit_urls):
            submit_url = candidate_url
            response = await client.post(submit_url, headers=api_headers(provider=provider), json=body)
            last_response = response
            if response.status_code >= 400 and response.status_code in (404, 405) and idx + 1 < len(submit_urls):
                continue
            response.raise_for_status()
            raw = response.json()
            break
        if raw is None:
            text = (last_response.text if last_response is not None else "")[:300]
            raise HTTPException(status_code=502, detail=f"上游视频接口错误：{text}")
        task_id = extract_task_id(raw) or raw.get("task_id") or raw.get("id")
        result = raw
        if task_id and not video_output_urls(raw):
            result = await wait_for_video_task(client, provider, str(task_id), submit_url)
        urls = video_output_urls(result)
        if not urls:
            raise HTTPException(status_code=502, detail=f"视频生成成功但没有返回视频：{result}")
        local_urls = [await save_remote_video_to_output(url) for url in urls]
        return {"videos": local_urls, "task_id": task_id, "raw": result}
