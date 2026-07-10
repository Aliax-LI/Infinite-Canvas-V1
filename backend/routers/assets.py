import base64
import os
import re
import urllib.parse
import uuid

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from backend.models.assets import (
    LocalAssetCaptionRequest,
    LocalAssetCaptionSaveRequest,
    LocalAssetClassifyRequest,
    LocalAssetDeleteRequest,
    LocalAssetFolderRequest,
    LocalAssetMoveRequest,
    LocalAssetRenameRequest,
    LocalAssetUrlImportRequest,
    LocalImageImportRequest,
)
from backend.services import asset_library_service, local_assets_service
from backend.services.media_paths import local_upload_kind_ext
from backend.services.request_guard import ensure_same_origin_request

router = APIRouter(tags=["assets"])


@router.get("/api/asset-library")
async def get_asset_library() -> dict:
    return {"library": asset_library_service.load_asset_library()}


@router.get("/api/local-assets")
async def list_local_assets() -> dict:
    tree, items = local_assets_service.local_upload_tree_and_items()
    return {"items": items, "tree": tree}


@router.post("/api/local-assets/upload")
async def upload_local_assets(files: list[UploadFile] = File(...), folder: str = Form("")) -> dict:
    uploaded = []
    for file in files:
        content = await file.read()
        if not content:
            continue
        uploaded.append(await local_assets_service.save_upload_file(content, file.filename or "file", file.content_type or "", folder))
    return {"files": uploaded}


@router.post("/api/local-assets/import-urls")
async def import_local_assets_from_urls(payload: LocalAssetUrlImportRequest) -> dict:
    uploaded = []
    results = []
    folder_rel, folder_abs = local_assets_service.local_upload_safe_folder(payload.folder)
    os.makedirs(folder_abs, exist_ok=True)
    timeout = httpx.Timeout(connect=20.0, read=120.0, write=30.0, pool=20.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "Infinite-Canvas-Asset-Importer/1.0"}) as client:
        for entry in (payload.items or [])[:200]:
            src_url = str(entry.url or "").strip()
            inline_data = str(entry.data or "").strip()
            result = {"url": src_url, "ok": False, "file": "", "error": ""}
            if not inline_data and not src_url.startswith(("http://", "https://")):
                result["error"] = "仅支持 http(s) 素材地址"
                results.append(result)
                continue
            try:
                if inline_data:
                    content_type = str(entry.content_type or "").split(";", 1)[0].strip().lower()
                    b64 = inline_data
                    if inline_data.startswith("data:"):
                        header, _, b64 = inline_data.partition(",")
                        if not content_type:
                            content_type = header[5:].split(";", 1)[0].strip().lower()
                    try:
                        content = base64.b64decode(b64, validate=False)
                    except (ValueError, TypeError):
                        raise HTTPException(status_code=400, detail="素材数据无法解码")
                    name_path = urllib.parse.urlparse(src_url).path
                else:
                    response = await client.get(src_url)
                    response.raise_for_status()
                    content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                    content = response.content
                    name_path = urllib.parse.urlparse(src_url).path
                kind, ext = local_upload_kind_ext(name_path, content_type)
                if kind == "image":
                    real = local_assets_service.sniff_image_ext_bytes(content[:16])
                    if real and not (real == ".jpg" and ext == ".jpeg"):
                        ext = real
                if kind not in ("image", "video"):
                    raise HTTPException(status_code=400, detail=f"不是图片或视频资源：{content_type or src_url}")
                if not content:
                    raise HTTPException(status_code=400, detail="素材内容为空")
                if entry.name:
                    base = os.path.splitext(entry.name)[0]
                else:
                    base = os.path.splitext(os.path.basename(urllib.parse.unquote(name_path)))[0]
                base = base or ("web-video" if kind == "video" else "web-image")
                base = re.sub(r"[^0-9A-Za-z一-鿿._-]+", "_", base).strip("_") or ("web-video" if kind == "video" else "web-image")
                base = base[:60]
                if ext and base.lower().endswith(ext.lower()):
                    base = base[:-len(ext)].rstrip(".") or ("web-video" if kind == "video" else "web-image")
                filename = f"up_{uuid.uuid4().hex[:12]}_{base}{ext}"
                rel_name = f"{folder_rel}/{filename}".lstrip("/")
                path = os.path.join(folder_abs, filename)
                with open(path, "wb") as f:
                    f.write(content)
                item = local_assets_service.local_upload_item(rel_name)
                uploaded.append(item)
                result.update({"ok": True, "file": rel_name, "item": item})
            except HTTPException as exc:
                result["error"] = str(exc.detail or "导入失败")
            except httpx.HTTPError as exc:
                result["error"] = str(exc) or "导入失败"
            results.append(result)
    return {"ok": True, "count": len(uploaded), "files": uploaded, "items": results}


@router.post("/api/local-assets/folders")
async def create_local_asset_folder(payload: LocalAssetFolderRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    parent_rel, parent_abs = local_assets_service.local_upload_safe_folder(payload.parent)
    if parent_rel and not os.path.isdir(parent_abs):
        raise HTTPException(status_code=404, detail="父文件夹不存在")
    name = local_assets_service.local_upload_safe_folder_name(payload.name)
    rel = f"{parent_rel}/{name}".lstrip("/")
    _, abs_path = local_assets_service.local_upload_safe_folder(rel)
    if os.path.exists(abs_path):
        raise HTTPException(status_code=400, detail="同名文件夹已存在")
    os.makedirs(abs_path, exist_ok=False)
    tree, items = local_assets_service.local_upload_tree_and_items()
    return {"ok": True, "folder": {"path": rel, "name": name}, "tree": tree, "items": items}


@router.patch("/api/local-assets/folders")
async def rename_local_asset_folder(payload: LocalAssetFolderRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    rel, abs_path = local_assets_service.local_upload_safe_folder(payload.path)
    if not rel:
        raise HTTPException(status_code=400, detail="根目录不能重命名")
    if not os.path.isdir(abs_path):
        raise HTTPException(status_code=404, detail="文件夹不存在")
    name = local_assets_service.local_upload_safe_folder_name(payload.name)
    parent = os.path.dirname(rel).replace("\\", "/")
    new_rel = f"{parent}/{name}".lstrip("/")
    _, new_abs = local_assets_service.local_upload_safe_folder(new_rel)
    if os.path.exists(new_abs):
        raise HTTPException(status_code=400, detail="同名文件夹已存在")
    os.rename(abs_path, new_abs)
    tree, items = local_assets_service.local_upload_tree_and_items()
    return {"ok": True, "folder": {"path": new_rel, "name": name}, "tree": tree, "items": items}


@router.patch("/api/local-assets/items")
async def rename_local_asset_item(payload: LocalAssetRenameRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    rel, abs_path = local_assets_service.local_upload_safe_path(payload.path)
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="本地素材不存在")
    kind, ext = local_upload_kind_ext(rel, "")
    if kind is None:
        raise HTTPException(status_code=400, detail="不支持的素材类型")
    new_stem = local_assets_service.local_upload_safe_file_stem(payload.name)
    old_ext = os.path.splitext(rel)[1] or ext
    parent = os.path.dirname(rel).replace("\\", "/")
    new_rel = f"{parent}/{new_stem}{old_ext}".lstrip("/")
    if new_rel == rel:
        tree, items = local_assets_service.local_upload_tree_and_items()
        return {"ok": True, "item": local_assets_service.local_upload_item(rel), "tree": tree, "items": items}
    _, new_abs = local_assets_service.local_upload_abs(new_rel)
    if os.path.exists(new_abs):
        raise HTTPException(status_code=400, detail="同名素材已存在")
    os.rename(abs_path, new_abs)
    for old_side, new_side in (
        (local_assets_service.local_upload_caption_path(rel), local_assets_service.local_upload_caption_path(new_rel)),
        (local_assets_service.local_upload_classification_path(rel), local_assets_service.local_upload_classification_path(new_rel)),
    ):
        if os.path.isfile(old_side) and not os.path.exists(new_side):
            os.rename(old_side, new_side)
    tree, items = local_assets_service.local_upload_tree_and_items()
    return {"ok": True, "item": local_assets_service.local_upload_item(new_rel), "old_path": rel, "tree": tree, "items": items}


@router.post("/api/local-assets/delete")
async def delete_local_assets(payload: LocalAssetDeleteRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    deleted = []
    for name in payload.names or []:
        try:
            rel, path = local_assets_service.local_upload_safe_path(name)
        except HTTPException:
            continue
        if os.path.isfile(path):
            try:
                os.remove(path)
                for side in (
                    local_assets_service.local_upload_caption_path(rel),
                    local_assets_service.local_upload_classification_path(rel),
                ):
                    if os.path.isfile(side):
                        os.remove(side)
                deleted.append(rel)
            except OSError:
                pass
    return {"deleted": deleted}


@router.post("/api/local-assets/move")
async def move_local_assets(payload: LocalAssetMoveRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    if not payload.names:
        raise HTTPException(status_code=400, detail="没有选择素材")
    target_rel, target_abs = local_assets_service.local_upload_safe_folder(payload.folder)
    if target_rel and not os.path.isdir(target_abs):
        raise HTTPException(status_code=404, detail="目标文件夹不存在")
    moved = 0
    for name in payload.names:
        try:
            rel, abs_path = local_assets_service.local_upload_safe_path(name)
        except HTTPException:
            continue
        if not os.path.isfile(abs_path):
            continue
        base = os.path.basename(rel)
        new_rel = f"{target_rel}/{base}".lstrip("/") if target_rel else base
        if new_rel == rel:
            continue
        _, new_abs = local_assets_service.local_upload_abs(new_rel)
        if os.path.exists(new_abs):
            stem, ext = os.path.splitext(base)
            base = f"{stem}_{uuid.uuid4().hex[:6]}{ext}"
            new_rel = f"{target_rel}/{base}".lstrip("/") if target_rel else base
            _, new_abs = local_assets_service.local_upload_abs(new_rel)
        try:
            os.makedirs(os.path.dirname(new_abs), exist_ok=True)
            os.rename(abs_path, new_abs)
            for src_sib, dst_sib in (
                (local_assets_service.local_upload_caption_path(rel), local_assets_service.local_upload_caption_path(new_rel)),
                (local_assets_service.local_upload_classification_path(rel), local_assets_service.local_upload_classification_path(new_rel)),
            ):
                if os.path.isfile(src_sib) and not os.path.exists(dst_sib):
                    os.rename(src_sib, dst_sib)
            moved += 1
        except OSError:
            continue
    tree, items = local_assets_service.local_upload_tree_and_items()
    return {"ok": True, "moved": moved, "items": items, "tree": tree}


@router.post("/api/local-assets/caption")
async def caption_local_assets(payload: LocalAssetCaptionRequest) -> dict:
    from backend.services import local_assets_ai_service

    prompt = (payload.prompt or "描述图片").strip() or "描述图片"
    items, ok_count = [], 0
    for name in (payload.names or [])[:100]:
        item = {"name": name, "ok": False, "caption": "", "caption_file": "", "error": ""}
        try:
            filename, path = local_assets_service.local_upload_safe_path(name)
            if not os.path.isfile(path):
                raise HTTPException(status_code=404, detail="文件不存在")
            kind, _ = local_upload_kind_ext(filename, "")
            if kind != "image":
                raise HTTPException(status_code=400, detail="仅支持图片素材反推提示词")
            caption, resolved_model = await local_assets_ai_service.caption_image_with_provider(
                path, prompt, payload.provider, payload.model, payload.ms_model
            )
            txt_path = local_assets_service.local_upload_caption_path(filename)
            with open(txt_path, "w", encoding="utf-8", newline="") as f:
                f.write(caption)
            item.update({"ok": True, "name": filename, "caption": caption, "caption_file": os.path.basename(txt_path), "model": resolved_model})
            ok_count += 1
        except HTTPException as exc:
            item["error"] = str(exc.detail or "反推失败")
        except Exception as exc:
            item["error"] = str(exc) or "反推失败"
        items.append(item)
    return {"ok": True, "count": ok_count, "items": items}


@router.post("/api/local-assets/classify")
async def classify_local_assets(payload: LocalAssetClassifyRequest) -> dict:
    from backend.services import local_assets_ai_service

    items, ok_count = [], 0
    for name in (payload.names or [])[:80]:
        item = {"name": name, "ok": False, "classification": None, "classification_file": "", "error": ""}
        try:
            filename, path = local_assets_service.local_upload_safe_path(name)
            if not os.path.isfile(path):
                raise HTTPException(status_code=404, detail="文件不存在")
            kind, _ = local_upload_kind_ext(filename, "")
            if kind != "image":
                raise HTTPException(status_code=400, detail="仅支持图片素材智能分类")
            classification = await local_assets_ai_service.classify_image_with_provider(
                path, payload.provider, payload.model, payload.ms_model, payload.prompt
            )
            local_assets_ai_service.write_local_upload_classification(filename, classification)
            item.update({
                "ok": True,
                "name": filename,
                "classification": classification,
                "classification_file": os.path.basename(local_assets_service.local_upload_classification_path(filename)),
                "model": classification.get("model") or "",
            })
            ok_count += 1
        except HTTPException as exc:
            item["error"] = str(exc.detail or "智能分类失败")
        except Exception as exc:
            item["error"] = str(exc) or "智能分类失败"
        items.append(item)
    return {"ok": True, "count": ok_count, "items": items}


@router.patch("/api/local-assets/caption")
async def save_local_asset_caption(payload: LocalAssetCaptionSaveRequest) -> dict:
    filename, path = local_assets_service.local_upload_safe_path(payload.name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    kind, _ = local_upload_kind_ext(filename, "")
    if kind != "image":
        raise HTTPException(status_code=400, detail="仅支持图片素材保存提示词")
    caption = str(payload.caption or "")[:100000]
    txt_path = local_assets_service.local_upload_caption_path(filename)
    with open(txt_path, "w", encoding="utf-8", newline="") as f:
        f.write(caption)
    return {"ok": True, "caption": caption, "caption_file": os.path.basename(txt_path)}


@router.post("/api/ai/import-local-image")
async def import_local_ai_reference(payload: LocalImageImportRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    requested = [payload.path] if payload.path else []
    requested.extend(payload.paths or [])
    requested = [p for p in requested if str(p or "").strip()][:20]
    if not requested:
        raise HTTPException(status_code=400, detail="没有可导入的本地图片")
    return {
        "files": [
            local_assets_service.import_local_image_file(local_assets_service.normalize_local_image_path(path))
            for path in requested
        ]
    }
