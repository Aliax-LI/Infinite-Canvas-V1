import base64
import mimetypes
import os
import uuid

from fastapi import HTTPException, UploadFile

from backend.config import MAX_UPLOAD_BYTES, ensure_data_dirs
from backend.services.media_paths import local_upload_kind_ext, output_path_for, output_url_for


async def upload_ai_reference_files(files: list[UploadFile]) -> list[dict]:
    ensure_data_dirs()
    uploaded: list[dict] = []
    doc_exts = {".pdf", ".txt", ".md", ".markdown", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".json", ".zip", ".yaml", ".yml", ".log"}
    for file in files:
        content = await file.read()
        if not content:
            continue
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"{file.filename or '文件'} 超过 50MB，无法上传")
        ext = os.path.splitext(file.filename or "")[1].lower()
        content_type = (file.content_type or "").lower()
        kind = "image"
        if ext in {".mp4", ".webm", ".mov", ".m4v", ".flv"} or content_type.startswith("video/"):
            kind = "video"
            if ext not in {".mp4", ".webm", ".mov", ".m4v", ".flv"}:
                ext = ".webm" if "webm" in content_type else ".mov" if "quicktime" in content_type else ".mp4"
        elif ext in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"} or content_type.startswith("audio/"):
            kind = "audio"
            if ext not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
                ext = ".wav" if "wav" in content_type else ".ogg" if "ogg" in content_type else ".m4a" if "mp4" in content_type else ".mp3"
        elif ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"} or content_type.startswith("image/"):
            kind = "image"
            if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
                ext = ".jpg" if "jpeg" in content_type else ".webp" if "webp" in content_type else ".gif" if "gif" in content_type else ".png"
        elif ext in doc_exts or content_type.startswith(("text/", "application/")):
            kind = "file"
            if not ext:
                ext = mimetypes.guess_extension(content_type) or ".bin"
        else:
            kind = "file"
            if not ext:
                ext = ".bin"
        filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
        path = output_path_for(filename, "input")
        with open(path, "wb") as f:
            f.write(content)
        uploaded.append({
            "url": output_url_for(filename, "input"),
            "name": file.filename or filename,
            "kind": kind,
            "mime": content_type,
        })
    return uploaded


def decode_base64_payload(data: str, content_type: str) -> tuple[bytes, str]:
    raw = (data or "").strip()
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    if raw.startswith("data:"):
        header, _, raw = raw.partition(",")
        if not ct:
            ct = header[5:].split(";", 1)[0].strip().lower()
    try:
        content = base64.b64decode(raw, validate=False)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="数据无法解码") from exc
    if not content:
        raise HTTPException(status_code=400, detail="内容为空")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="超过 50MB")
    return content, ct
