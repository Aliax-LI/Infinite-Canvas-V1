from typing import Any

import httpx
from fastapi import HTTPException

from backend.services.api_providers_service import get_api_provider
from backend.services.asset_library_service import find_asset_item_in_library, load_asset_library, save_asset_library
from backend.services.chat_service import api_headers, is_apimart_provider, is_volcengine_provider
from backend.services.canvas_video_service import video_api_root
from backend.services.common import now_ms
from backend.services.media_paths import output_file_from_url

AVATAR_SUPPORTED_PLATFORMS = {"apimart", "volcengine"}
AVATAR_TASK_DONE_STATUSES = {"completed", "complete", "succeeded", "success", "active", "done"}
AVATAR_TASK_FAIL_STATUSES = {"failed", "fail", "error", "rejected", "canceled", "cancelled", "expired"}


def avatar_platform_for_provider(provider: dict) -> str:
    if not provider:
        return ""
    if is_apimart_provider(provider):
        return "apimart"
    if is_volcengine_provider(provider):
        return "volcengine"
    return ""


def apimart_avatar_asset_type(kind: str) -> str:
    return {"video": "Video", "audio": "Audio"}.get(str(kind or "").lower(), "Image")


def extract_apimart_avatar_asset_uri(payload) -> str:
    if isinstance(payload, list):
        for item in payload:
            found = extract_apimart_avatar_asset_uri(item)
            if found:
                return found
        return ""
    if not isinstance(payload, dict):
        return ""
    for key in ("asset_url", "assetUrl", "uri", "url"):
        value = str(payload.get(key) or "").strip()
        if value.startswith("asset://"):
            return value
    for key in ("usable_assets", "assets", "result", "data"):
        found = extract_apimart_avatar_asset_uri(payload.get(key))
        if found:
            return found
    asset_id = str(payload.get("asset_id") or payload.get("assetId") or "").strip()
    if asset_id:
        return f"asset://{asset_id}"
    return ""


async def upload_media_for_apimart(client, provider, ref_url: str, kind: str) -> str:
    ref_url = str(ref_url or "").strip()
    if ref_url.startswith(("http://", "https://", "asset://")):
        return ref_url
    path = output_file_from_url(ref_url)
    if not path:
        return f"ERR:无法解析素材地址：{ref_url[:120]}"
    public_base = str(__import__("os").getenv("PUBLIC_BASE_URL", "") or "").strip().rstrip("/")
    if public_base:
        return f"{public_base}{ref_url if ref_url.startswith('/') else '/' + ref_url}"
    return f"ERR:请配置 PUBLIC_BASE_URL 以提交本地素材到 APIMart。"


async def submit_apimart_avatar_asset(provider, public_url: str, name: str, kind: str, project_name: str = "default", group_name: str = "") -> str:
    base_url = video_api_root(provider)
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider.get('id')} 未配置 Base URL")
    register_url = f"{base_url}/v1/seedance2/private-avatar"
    body = {
        "project_name": str(project_name or "default").strip() or "default",
        "asset_type": apimart_avatar_asset_type(kind),
        "group": {"name": (group_name or name or "数字人素材")[:60]},
        "assets": [{"url": public_url, "name": (name or "asset")[:60]}],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(register_url, headers=api_headers(provider=provider), json=body, timeout=120)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"APIMart 数字人注册失败（{resp.status_code}）：{resp.text[:300]}")
        data = resp.json()
        task = data.get("data") if isinstance(data.get("data"), dict) else data
        task_id = str(task.get("id") or task.get("task_id") or "").strip()
        if not task_id:
            raise HTTPException(status_code=502, detail=f"APIMart 数字人注册返回中未找到任务 ID：{str(data)[:300]}")
        return task_id


async def check_apimart_avatar_task(provider, task_id: str) -> dict[str, Any]:
    base_url = video_api_root(provider)
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider.get('id')} 未配置 Base URL")
    task_url = f"{base_url}/v1/tasks/{task_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(task_url, headers=api_headers(provider=provider), timeout=60)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"查询审核状态失败（{resp.status_code}）：{resp.text[:200]}")
        payload = resp.json()
    node = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    status = str(node.get("status") or "").strip().lower()
    if status in AVATAR_TASK_DONE_STATUSES:
        asset_uri = extract_apimart_avatar_asset_uri(payload)
        if not asset_uri:
            return {"status": "Failed", "asset_uri": "", "detail": "审核完成，但未返回 asset:// 地址。"}
        return {"status": "Active", "asset_uri": asset_uri, "detail": ""}
    if status in AVATAR_TASK_FAIL_STATUSES:
        return {"status": "Failed", "asset_uri": "", "detail": f"审核未通过（{status}）。"}
    return {"status": "Processing", "asset_uri": "", "detail": "审核中"}


async def register_asset_library_avatar(item_id: str, payload) -> dict:
    lib = load_asset_library()
    target_item = find_asset_item_in_library(lib, item_id, payload.library_id)
    if not target_item:
        raise HTTPException(status_code=404, detail="资产不存在")
    provider = get_api_provider(payload.provider_id)
    platform = avatar_platform_for_provider(provider)
    if platform not in AVATAR_SUPPORTED_PLATFORMS:
        name = (provider or {}).get("name") or (provider or {}).get("id") or "该平台"
        raise HTTPException(status_code=400, detail=f"「{name}」暂不支持数字人/真人认证。")
    kind = str(target_item.get("kind") or "image").lower()
    if kind not in ("image", "video", "audio"):
        kind = "image"
    project_name = str(payload.project_name or "default").strip() or "default"
    if platform == "apimart":
        async with httpx.AsyncClient(timeout=120) as client:
            public_url = await upload_media_for_apimart(client, provider, target_item.get("url") or "", kind)
        if not str(public_url).startswith(("http://", "https://", "asset://")):
            reason = public_url[4:] if isinstance(public_url, str) and public_url.startswith("ERR:") else str(public_url)
            raise HTTPException(status_code=400, detail=f"素材无法提交到 APIMart：{reason}")
        task_id = await submit_apimart_avatar_asset(provider, public_url, target_item.get("name") or "asset", kind, project_name=project_name, group_name=payload.group_name)
    else:
        raise HTTPException(status_code=400, detail="火山数字人认证尚未在本环境启用，请使用 APIMart。")
    regs = target_item.get("registrations") if isinstance(target_item.get("registrations"), dict) else {}
    regs[platform] = {
        "provider_id": provider["id"],
        "project_name": project_name,
        "task_id": task_id,
        "status": "Processing",
        "detail": "已提交，审核中",
        "asset_uri": "",
        "asset_id": "",
        "registered_at": now_ms(),
    }
    target_item["registrations"] = regs
    save_asset_library(lib)
    return {"library": lib, "item": target_item}


async def check_asset_library_avatar(item_id: str, payload) -> dict:
    lib = load_asset_library()
    target_item = find_asset_item_in_library(lib, item_id, payload.library_id)
    if not target_item:
        raise HTTPException(status_code=404, detail="资产不存在")
    regs = target_item.get("registrations") if isinstance(target_item.get("registrations"), dict) else {}
    provider = get_api_provider(payload.provider_id or "")
    platform = avatar_platform_for_provider(provider)
    if platform not in AVATAR_SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail="该平台暂不支持数字人/真人认证审核。")
    reg = regs.get(platform) if isinstance(regs.get(platform), dict) else {}
    task_id = str(reg.get("task_id") or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="该素材还没有提交到这个平台的认证审核。")
    if platform == "apimart":
        result = await check_apimart_avatar_task(provider, task_id)
    else:
        raise HTTPException(status_code=400, detail="该平台认证后端尚未接入。")
    reg["status"] = result["status"]
    reg["detail"] = result.get("detail") or ""
    if result["status"] == "Active" and result.get("asset_uri"):
        reg["asset_uri"] = result["asset_uri"]
        reg["asset_id"] = result["asset_uri"].replace("asset://", "")
    regs[platform] = reg
    target_item["registrations"] = regs
    save_asset_library(lib)
    return {"library": lib, "item": target_item}
