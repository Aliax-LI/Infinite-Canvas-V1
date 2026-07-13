import asyncio
import os
import time
from typing import Any

import httpx
from fastapi import HTTPException

from backend.models.generate import CloudGenRequest, CloudPollRequest
from backend.services.ai_config_service import modelscope_api_key, modelscope_image_api_root
from backend.services.chat_service import selected_model
from backend.services.history_service import append_history_record
from backend.services.ms_generate_service import (
    MS_GENERATE_POLL_INTERVAL,
    MS_GENERATE_POLL_MAX,
    TERMINAL_FAILED_STATUSES,
    download_ms_image,
    modelscope_image_url,
    modelscope_size,
)


async def _poll_ms_angle_task(client, api_root: str, headers: dict, task_id: str, prompt: str, client_id: str | None = None) -> dict:
    for i in range(MS_GENERATE_POLL_MAX):
        await asyncio.sleep(MS_GENERATE_POLL_INTERVAL)
        result = await client.get(
            f"{api_root}/tasks/{task_id}",
            headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
        )
        result.raise_for_status()
        data = result.json()
        status = str(data.get("task_status") or "").upper()
        if status == "SUCCEED":
            images = data.get("output_images") or []
            if not images:
                raise HTTPException(status_code=502, detail=f"ModelScope 成功但没有返回图片：{data}")
            img_url = images[0]
            model = str(headers.get("_model") or "angle")
            local_path = await download_ms_image(img_url, model)
            record = {"timestamp": time.time(), "prompt": prompt, "images": [local_path], "type": "angle"}
            append_history_record(record)
            return {"url": local_path, "task_id": task_id}
        if status in TERMINAL_FAILED_STATUSES:
            raise HTTPException(status_code=502, detail=f"ModelScope task failed: {data}")
    return {"status": "timeout", "task_id": task_id, "message": "Task still pending"}


async def poll_angle_status(req: CloudPollRequest) -> dict:
    api_root = modelscope_image_api_root()
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")
    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true",
        "_model": "angle-resume",
    }
    task_id = str(req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="task_id 必填")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            return await _poll_ms_angle_task(client, api_root, headers, task_id, f"Resumed {task_id}", req.client_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def angle_generate(req: CloudGenRequest) -> dict:
    api_root = modelscope_image_api_root()
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")
    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true",
    }
    model = selected_model(req.model, "Qwen/Qwen-Image-Edit-2511")
    payload: dict[str, Any] = {
        "model": model,
        "prompt": req.prompt.strip(),
        "image_url": [modelscope_image_url(url, max_size=1536) for url in req.image_urls],
    }
    if req.resolution:
        payload["size"] = modelscope_size(req.resolution)
    if req.loras is not None:
        payload["loras"] = req.loras
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(f"{api_root}/images/generations", headers=headers, json=payload)
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except Exception:
                    detail = (submit_res.text or "").strip()
                if not detail:
                    detail = f"ModelScope 返回 HTTP {submit_res.status_code}，无响应正文"
                raise HTTPException(status_code=submit_res.status_code, detail=detail)
            task_id = submit_res.json().get("task_id")
            if not task_id:
                raise HTTPException(status_code=502, detail=f"ModelScope 未返回 task_id：{submit_res.text}")
            poll_headers = {**headers, "_model": model.replace("/", "_")}
            return await _poll_ms_angle_task(client, api_root, poll_headers, task_id, req.prompt, req.client_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
