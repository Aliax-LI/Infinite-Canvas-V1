import asyncio
import os
import re
import time
from typing import Any

import httpx
from fastapi import HTTPException

from backend.models.generate import MsGenerateRequest
from backend.services.ai_config_service import modelscope_api_key, modelscope_image_api_root
from backend.services.history_service import append_history_record
from backend.services.media_paths import output_path_for, output_url_for

MS_GENERATE_POLL_MAX = int(os.getenv("MS_GENERATE_POLL_MAX", "300"))
MS_GENERATE_POLL_INTERVAL = float(os.getenv("MS_GENERATE_POLL_INTERVAL", "2"))
TERMINAL_FAILED_STATUSES = {"FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED", "TIMEOUT", "REVOKED"}


def modelscope_size(value: str, fallback: str = "1024x1024") -> str:
    size = str(value or fallback).strip().lower().replace("*", "x")
    if re.fullmatch(r"\d{2,5}x\d{2,5}", size):
        return size
    raise HTTPException(status_code=400, detail=f"ModelScope size 格式不正确：{value or fallback}，应为 WxH，例如 1024x1024")


def modelscope_image_url(value: str, max_size: int = 1536) -> str:
    _ = max_size
    return str(value or "").strip()


async def download_ms_image(img_url: str, model: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            img_res = await client.get(img_url)
            if img_res.status_code == 200:
                filename = f"ms_{model.replace('/', '_').replace(':', '_')}_{int(time.time())}.png"
                file_path = output_path_for(filename, "output")
                with open(file_path, "wb") as f:
                    f.write(img_res.content)
                return output_url_for(filename, "output")
    except Exception:
        pass
    return img_url


async def ms_generate(req: MsGenerateRequest) -> dict[str, Any]:
    api_root = modelscope_image_api_root()
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未配置 ModelScope API Key，请在 API 设置中填写，或重新保存 ModelScope Token。")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true",
    }
    payload: dict[str, Any] = {
        "model": req.model,
        "prompt": req.prompt.strip(),
    }
    if req.width and req.height:
        payload["width"] = req.width
        payload["height"] = req.height
        payload["size"] = modelscope_size(req.size or f"{req.width}x{req.height}")
    elif req.size:
        payload["size"] = modelscope_size(req.size)
    if req.image_urls:
        payload["image_url"] = [modelscope_image_url(url, max_size=1536) for url in req.image_urls]
    if req.loras is not None:
        payload["loras"] = req.loras

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(f"{api_root}/images/generations", headers=headers, json=payload)
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except Exception:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            if not task_id:
                raise HTTPException(status_code=502, detail="ModelScope 未返回 task_id")

            for _ in range(MS_GENERATE_POLL_MAX):
                await asyncio.sleep(MS_GENERATE_POLL_INTERVAL)
                try:
                    result = await client.get(
                        f"{api_root}/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if status == "SUCCEED":
                        output_images = data.get("output_images") or []
                        if not output_images:
                            raise HTTPException(status_code=502, detail="ModelScope 任务成功但未返回图片")
                        img_url = output_images[0]
                        local_path = await download_ms_image(img_url, req.model)
                        record = {
                            "timestamp": time.time(),
                            "prompt": req.prompt,
                            "images": [local_path],
                            "type": "klein",
                            "model": req.model,
                        }
                        append_history_record(record)
                        return {"url": local_path, "task_id": task_id}

                    if status in TERMINAL_FAILED_STATUSES:
                        error_info = data.get("error_info") or data.get("message") or data.get("detail") or str(data)
                        raise HTTPException(status_code=502, detail=f"MS task {status}: {error_info}")
                except HTTPException:
                    raise
                except Exception:
                    continue

            raise HTTPException(status_code=504, detail="MS 生图超时")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
