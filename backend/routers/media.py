import asyncio
import os
import uuid
import urllib.parse

import requests
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse

from backend.models.media import Base64UploadRequest
from backend.services import media_upload
from backend.services import media_preview as media_preview_service
from backend.services.comfyui_client import fetch_view_from_comfyui, upload_image_to_comfyui
from backend.services.media_paths import (
    content_type_for_path,
    filename_from_media_url,
    local_media_file_by_basename,
    local_upload_kind_ext,
    output_file_from_url,
    output_path_for,
    output_url_for,
    rewrite_runninghub_file_url,
    sanitize_export_filename,
)

router = APIRouter(tags=["media"])


@router.get("/api/media-preview")
async def media_preview_endpoint(url: str, w: int = 512) -> FileResponse:
    path = output_file_from_url(url)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="媒体文件不存在")
    try:
        out_path, media_type = await asyncio.to_thread(media_preview_service.build_media_preview, path, w)
        return FileResponse(out_path, media_type=media_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=415, detail=f"无法生成预览图：{exc}") from exc
    except OSError as exc:
        raise HTTPException(status_code=415, detail=f"无法生成预览图：{exc}") from exc


@router.get("/api/image-jpeg")
async def image_jpeg_endpoint(url: str, w: int = 0) -> FileResponse:
    path = output_file_from_url(url)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="媒体文件不存在")
    try:
        out_path = await asyncio.to_thread(media_preview_service.build_image_jpeg, path, w)
        return FileResponse(out_path, media_type="image/jpeg")
    except OSError as exc:
        raise HTTPException(status_code=415, detail=f"无法转换图片：{exc}") from exc


@router.get("/api/view")
def view_image(filename: str, type: str = "input", subfolder: str = "") -> Response:
    remote = fetch_view_from_comfyui(filename, type, subfolder)
    if remote:
        content, media_type = remote
        return Response(content=content, media_type=media_type)
    if not subfolder and type in ("input", "output"):
        safe_name = os.path.basename(filename or "")
        if safe_name:
            local_path = output_path_for(safe_name, "input" if type == "input" else "output")
            if os.path.isfile(local_path):
                return FileResponse(local_path, media_type=content_type_for_path(local_path))
    raise HTTPException(status_code=404, detail="Image not found on any available backend")


@router.get("/api/download-output")
def download_output(request: Request, url: str, name: str = "", inline: bool = False) -> Response:
    url = rewrite_runninghub_file_url(url)
    path = output_file_from_url(url)
    if not path:
        path = local_media_file_by_basename(filename_from_media_url(url, ""))
    if path:
        filename = sanitize_export_filename(
            os.path.basename(name) if name else os.path.basename(path),
            os.path.basename(path),
        )
        return FileResponse(
            path,
            media_type=content_type_for_path(path),
            filename=None if inline else filename,
        )
    parsed = urllib.parse.urlparse(str(url or "").strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="无效的下载地址")
    try:
        upstream_headers = {"User-Agent": "Infinite-Canvas/1.0"}
        range_header = request.headers.get("range")
        if range_header:
            upstream_headers["Range"] = range_header
        upstream = requests.get(url, stream=True, timeout=(10, 60), headers=upstream_headers)
        upstream.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"远程文件下载失败：{exc}") from exc
    content_type = upstream.headers.get("content-type") or "application/octet-stream"
    fallback = filename_from_media_url(url, "download.bin")
    filename = sanitize_export_filename(os.path.basename(name) if name else fallback, fallback)
    disposition = "inline" if inline else "attachment"
    headers = {"Content-Disposition": f"{disposition}; filename*=UTF-8''{urllib.parse.quote(filename)}"}
    content_length = upstream.headers.get("content-length")
    if content_length:
        headers["Content-Length"] = content_length
    for key in ("content-range", "accept-ranges"):
        value = upstream.headers.get(key)
        if value:
            headers["-".join(part.capitalize() for part in key.split("-"))] = value

    def stream_remote():
        try:
            for chunk in upstream.iter_content(chunk_size=256 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(stream_remote(), media_type=content_type, headers=headers, status_code=upstream.status_code)


@router.post("/api/upload")
async def upload_image(files: list[UploadFile] = File(...)) -> dict:
    uploaded_files = []
    files_content = []
    for file in files:
        content = await file.read()
        files_content.append((file, content))
    for file, content in files_content:
        comfy_name = upload_image_to_comfyui(file.filename or "upload.png", content, file.content_type or "image/png")
        if comfy_name:
            uploaded_files.append({"comfy_name": comfy_name})
        else:
            raise HTTPException(status_code=500, detail="Failed to upload to any backend")
    return {"files": uploaded_files}


@router.post("/api/ai/upload")
async def upload_ai_reference(files: list[UploadFile] = File(...)) -> dict:
    return {"files": await media_upload.upload_ai_reference_files(files)}


@router.post("/api/ai/upload-base64")
async def upload_ai_base64(payload: Base64UploadRequest) -> dict:
    content, ct = media_upload.decode_base64_payload(payload.data, payload.content_type)
    kind, ext = local_upload_kind_ext(payload.name or "", ct or "image/png")
    if kind is None:
        kind, ext = "image", ".png"
    filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
    path = output_path_for(filename, "input")
    with open(path, "wb") as f:
        f.write(content)
    return {"files": [{"url": output_url_for(filename, "input"), "name": payload.name or filename, "kind": kind}]}


@router.post("/api/comfyui/upload-base64")
async def upload_comfyui_base64(payload: Base64UploadRequest) -> dict:
    content, ct = media_upload.decode_base64_payload(payload.data, payload.content_type)
    _, ext = local_upload_kind_ext(payload.name or "", ct or "image/png")
    filename = f"dx_{uuid.uuid4().hex[:12]}{ext or '.png'}"
    comfy_name = upload_image_to_comfyui(filename, content, ct or "image/png")
    if not comfy_name:
        raise HTTPException(status_code=502, detail="上传到 ComfyUI 失败")
    return {"name": comfy_name}
