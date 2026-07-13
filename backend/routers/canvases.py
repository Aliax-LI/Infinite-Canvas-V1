import asyncio
import os
import re
import urllib.parse
import zipfile
from io import BytesIO
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.models.canvas import (
    CanvasAssetCheckRequest,
    CanvasAssetDownloadRequest,
    CanvasBatchIdsRequest,
    CanvasCreateRequest,
    CanvasMetaUpdate,
    CanvasSaveRequest,
    SmartCanvasGroupExportRequest,
)
from backend.services import canvas_service, prompt_templates, smart_canvas_service
from backend.services.common import now_ms
from backend.services.media_paths import (
    fetch_remote_media_bytes,
    filename_from_media_url,
    local_media_file_by_basename,
    output_file_from_url,
    sanitize_export_filename,
)
from backend.services.ws_manager import manager

router = APIRouter(tags=["canvases"])


@router.get("/api/canvases")
async def canvases() -> dict[str, Any]:
    return {"canvases": canvas_service.list_canvases()}


@router.get("/api/canvases/trash")
async def trashed_canvases() -> dict[str, Any]:
    return {"canvases": canvas_service.list_deleted_canvases(), "retention_days": 30}


@router.post("/api/canvases/trash/restore-batch")
async def restore_canvases_batch(payload: CanvasBatchIdsRequest) -> dict[str, Any]:
    return canvas_service.restore_canvases_batch(payload.ids)


@router.post("/api/canvases/trash/purge-batch")
async def purge_canvases_batch(payload: CanvasBatchIdsRequest) -> dict[str, Any]:
    return canvas_service.purge_canvases_batch(payload.ids)


@router.post("/api/canvases")
async def create_canvas(payload: CanvasCreateRequest) -> dict[str, Any]:
    return {
        "canvas": canvas_service.new_canvas(
            payload.title,
            payload.icon,
            payload.kind,
            payload.project,
            payload.board_x,
            payload.board_y,
        )
    }


@router.get("/api/canvases/{canvas_id}/meta")
async def get_canvas_meta(canvas_id: str) -> dict[str, Any]:
    canvas = canvas_service.load_canvas(canvas_id)
    return {
        "id": canvas.get("id"),
        "updated_at": canvas.get("updated_at", 0),
        "title": canvas.get("title", "未命名画布"),
        "icon": canvas.get("icon", "layers"),
        "kind": canvas_service.normalize_canvas_kind(canvas.get("kind")),
    }


@router.post("/api/canvases/{canvas_id}/meta")
async def update_canvas_meta(canvas_id: str, payload: CanvasMetaUpdate) -> dict[str, Any]:
    return {"canvas": canvas_service.update_canvas_meta(canvas_id, payload.model_dump(exclude_unset=True))}


@router.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str) -> dict[str, Any]:
    return {"canvas": canvas_service.load_canvas(canvas_id)}


@router.post("/api/canvases/{canvas_id}/touch")
async def touch_canvas(canvas_id: str) -> dict[str, Any]:
    canvas = canvas_service.load_canvas(canvas_id)
    canvas_service.save_canvas(canvas)
    return {
        "canvas": canvas_service.canvas_record(canvas),
        "updated_at": canvas.get("updated_at", 0),
    }


@router.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest) -> dict[str, Any]:
    canvas = canvas_service.update_canvas(canvas_id, payload.model_dump())
    await manager.broadcast_canvas_updated(
        canvas_id,
        int(canvas.get("updated_at") or now_ms()),
        payload.client_id,
    )
    return {"canvas": canvas}


@router.delete("/api/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str) -> dict[str, bool]:
    canvas_service.delete_canvas(canvas_id)
    return {"ok": True}


@router.post("/api/canvases/{canvas_id}/restore")
async def restore_canvas(canvas_id: str) -> dict[str, Any]:
    return {"canvas": canvas_service.restore_canvas(canvas_id)}


@router.delete("/api/canvases/{canvas_id}/purge")
async def purge_canvas(canvas_id: str) -> dict[str, bool]:
    canvas_service.purge_canvas(canvas_id)
    return {"ok": True}


@router.get("/api/canvas-assets")
async def list_canvas_assets() -> dict[str, Any]:
    return await asyncio.to_thread(canvas_service.canvas_assets_index)


@router.get("/api/smart-canvas/prompt-templates")
async def smart_canvas_prompt_templates() -> dict[str, Any]:
    try:
        template_path = prompt_templates.prompt_template_markdown_path()
        source = os.path.relpath(template_path, os.getcwd()).replace("\\", "/") if template_path else ""
        return {"templates": prompt_templates.builtin_prompt_templates(), "source": source}
    except OSError:
        return {"templates": []}


@router.post("/api/smart-canvas/group-export")
async def export_smart_canvas_group(payload: SmartCanvasGroupExportRequest) -> dict[str, Any]:
    return smart_canvas_service.export_smart_canvas_group(payload)


@router.post("/api/canvas-assets/check")
async def check_canvas_assets(payload: CanvasAssetCheckRequest) -> dict[str, Any]:
    result: dict[str, bool] = {}
    for url in payload.urls[:3000]:
        text = str(url or "").strip()
        if not text:
            continue
        if text.startswith("/output/") or text.startswith("/assets/"):
            result[text] = bool(output_file_from_url(text))
        else:
            result[text] = True
    return {"exists": result}


@router.post("/api/canvas-assets/download")
async def download_canvas_assets(payload: CanvasAssetDownloadRequest) -> Response:
    buffer = BytesIO()
    used_names: set[str] = set()
    count = 0
    raw_items = payload.items or [{"url": url} for url in payload.urls]
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for raw in raw_items[:1000]:
            if isinstance(raw, dict):
                text = str(raw.get("url") or "").strip()
                requested_name = str(raw.get("name") or "").strip()
            else:
                text = str(raw or "").strip()
                requested_name = ""
            if not text:
                continue
            path = output_file_from_url(text)
            content = None
            if path and os.path.isfile(path):
                base = sanitize_export_filename(requested_name or os.path.basename(path), os.path.basename(path) or f"image-{count + 1}.png")
            else:
                local_by_name = local_media_file_by_basename(filename_from_media_url(text, ""))
                if local_by_name and os.path.isfile(local_by_name):
                    path = local_by_name
                    base = sanitize_export_filename(requested_name or os.path.basename(path), os.path.basename(path) or f"image-{count + 1}.png")
                else:
                    try:
                        remote = fetch_remote_media_bytes(text)
                    except HTTPException:
                        remote = None
                    if not remote:
                        continue
                    content, _content_type = remote
                    base = sanitize_export_filename(requested_name or filename_from_media_url(text, f"image-{count + 1}.bin"), f"image-{count + 1}.bin")
            name, ext = os.path.splitext(base)
            archive_name = base
            suffix = 2
            while archive_name in used_names:
                archive_name = f"{name}-{suffix}{ext}"
                suffix += 1
            used_names.add(archive_name)
            if path and os.path.isfile(path):
                zf.write(path, archive_name)
            else:
                zf.writestr(archive_name, content)
            count += 1
    if count <= 0:
        raise HTTPException(status_code=404, detail="没有可下载的本地图片")
    buffer.seek(0)
    filename = re.sub(r'[\\/:*?"<>|]+', "_", payload.filename or "canvas-output-images.zip")
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    encoded = urllib.parse.quote(filename)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    return Response(buffer.getvalue(), media_type="application/zip", headers=headers)
