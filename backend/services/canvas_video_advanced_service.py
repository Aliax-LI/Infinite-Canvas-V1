import os

import httpx
from fastapi import HTTPException

from backend.services.chat_service import api_headers, selected_model
from backend.services.canvas_video_service import VIDEO_POLL_TIMEOUT, video_output_urls, wait_for_video_task
from backend.services.jimeng_cli_service import save_remote_video_to_output
from backend.services.media_paths import content_type_for_path, output_file_from_url


def is_yuli_provider(provider: dict) -> bool:
    base = str((provider or {}).get("base_url") or "").lower()
    pid = str((provider or {}).get("id") or "").strip().lower()
    return pid == "yuli" or "yuli.host" in base or "yuliapi" in base


def is_agnes_provider(provider: dict, model: str = "") -> bool:
    base = str((provider or {}).get("base_url") or "").lower()
    pid = str((provider or {}).get("id") or "").strip().lower()
    if pid == "agnes" or "agnes-ai.com" in base:
        return True
    return str(model or "").strip().lower().startswith("agnes-")


def agnes_video_dimensions(aspect_ratio: str = "", resolution: str = "") -> tuple[int, int]:
    ratio = str(aspect_ratio or "16:9").strip()
    res = str(resolution or "720p").strip().lower()
    long_edge = 1080 if res in {"1080p", "1k"} else 720
    parts = ratio.split(":")
    if len(parts) == 2:
        try:
            rw, rh = int(parts[0]), int(parts[1])
            if rw >= rh:
                return long_edge, max(1, int(long_edge * rh / rw))
            return max(1, int(long_edge * rw / rh)), long_edge
        except Exception:
            pass
    return long_edge, int(long_edge * 9 / 16)


def agnes_video_frame_count(duration, fps=24) -> tuple[int, int]:
    try:
        seconds = int(duration or 5)
    except Exception:
        seconds = 5
    seconds = max(2, min(16, seconds))
    return seconds * fps, fps


async def agnes_video_image_url(ref) -> str:
    url = str(getattr(ref, "url", "") or (ref.get("url") if isinstance(ref, dict) else "") or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://", "data:")):
        return url
    path = output_file_from_url(url)
    if not path:
        return ""
    import base64
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{content_type_for_path(path)};base64,{encoded}"


def yuli_is_veo_openai_model(model: str) -> bool:
    norm = str(model or "").strip().lower().replace("_", "").replace(".", "").replace("-", "")
    return norm in {"veo31", "veo31fast"}


def yuli_openai_model_name(model: str) -> str:
    norm = str(model or "").strip().lower().replace("_", "").replace(".", "").replace("-", "")
    return "veo_3_1-fast" if norm == "veo31fast" else "veo_3_1"


def yuli_openai_size(aspect_ratio: str) -> str:
    return "9x16" if str(aspect_ratio or "").strip() == "9:16" else "16x9"


def yuli_video_seconds(duration) -> str:
    try:
        value = int(duration)
    except Exception:
        value = 8
    return str(value if value > 0 else 8)


async def yuli_fetch_reference_bytes(client, ref_url):
    ref_url = str(ref_url or "").strip()
    if not ref_url:
        return None
    path = output_file_from_url(ref_url)
    if path:
        with open(path, "rb") as f:
            raw = f.read()
        return (os.path.basename(path) or "input_reference", raw, content_type_for_path(path))
    if ref_url.startswith(("http://", "https://")):
        resp = await client.get(ref_url)
        resp.raise_for_status()
        mime = (resp.headers.get("content-type") or "image/png").split(";")[0].strip()
        ext = (mime.split("/")[-1] or "png").split("+")[0]
        return (f"input_reference.{ext}", resp.content, mime)
    return None


async def generate_agnes_video(client, payload, provider, base_url, requested_model):
    model = selected_model(requested_model, "agnes-video-v2.0")
    width, height = agnes_video_dimensions(payload.aspect_ratio, payload.resolution)
    num_frames, frame_rate = agnes_video_frame_count(payload.duration, 24)
    body = {"model": model, "prompt": str(payload.prompt or ""), "width": width, "height": height, "num_frames": num_frames, "frame_rate": frame_rate}
    image_urls = []
    for ref in (payload.images or [])[:4]:
        url = await agnes_video_image_url(ref)
        if url:
            image_urls.append(url)
    if len(image_urls) == 1:
        body["image"] = image_urls[0]
    elif len(image_urls) > 1:
        body["extra_body"] = {"image": image_urls}
    submit_url = f"{base_url}/v1/videos"
    response = await client.post(submit_url, headers=api_headers(provider=provider, model=model), json=body)
    response.raise_for_status()
    raw = response.json()
    task_id = str(raw.get("task_id") or raw.get("id") or "").strip()
    if task_id and not video_output_urls(raw):
        raw = await wait_for_video_task(client, provider, task_id, submit_url)
    urls = video_output_urls(raw)
    if not urls:
        raise HTTPException(status_code=502, detail=f"Agnes 视频生成成功但没有返回视频：{raw}")
    local_urls = [await save_remote_video_to_output(url) for url in urls]
    return {"videos": local_urls, "task_id": task_id, "raw": raw}


async def generate_yuli_openai_video(client, payload, provider, base_url, requested_model):
    submit_url = f"{base_url}/v1/videos"
    data = {
        "model": yuli_openai_model_name(requested_model),
        "prompt": str(payload.prompt or ""),
        "seconds": yuli_video_seconds(payload.duration),
        "size": yuli_openai_size(payload.aspect_ratio),
        "watermark": "true" if payload.watermark else "false",
    }
    files = {}
    for ref in (payload.images or [])[:1]:
        ref_file = await yuli_fetch_reference_bytes(client, getattr(ref, "url", ""))
        if ref_file:
            files["input_reference"] = ref_file
            break
    headers = api_headers(json_body=False, provider=provider)
    if files:
        response = await client.post(submit_url, headers=headers, data=data, files=files)
    else:
        response = await client.post(submit_url, headers=headers, data=data)
    response.raise_for_status()
    raw = response.json()
    task_id = str(raw.get("id") or raw.get("task_id") or "").strip()
    if task_id and not video_output_urls(raw):
        raw = await wait_for_video_task(client, provider, task_id, submit_url)
    urls = video_output_urls(raw)
    if not urls:
        raise HTTPException(status_code=502, detail=f"玉玉视频生成成功但没有返回视频：{raw}")
    local_urls = [await save_remote_video_to_output(url) for url in urls]
    return {"videos": local_urls, "task_id": task_id, "raw": raw}
