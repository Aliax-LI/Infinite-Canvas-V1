import os
import re
import urllib.parse

import requests
from fastapi import HTTPException

from backend.config import (
    ASSETS_DIR,
    ASSET_LIBRARY_DIR,
    LEGACY_ASSETS_DIR,
    LEGACY_OUTPUT_DIR,
    OUTPUT_DIR,
    OUTPUT_INPUT_DIR,
    OUTPUT_OUTPUT_DIR,
    RUNNINGHUB_FILE_HOST_REWRITES,
)


def sanitize_export_filename(name: str, fallback: str) -> str:
    base = os.path.basename(str(name or "").strip()) or fallback
    base = re.sub(r'[\\/:*?"<>|]+', "_", base)
    return base or fallback


def sanitize_asset_name(name: str, fallback: str = "asset") -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", str(name or fallback)).strip()
    return cleaned[:120] or fallback


def output_storage(category: str = "output") -> tuple[str, str]:
    from backend.storage.local_object_store import LocalObjectStore
    from backend.storage.object_store_factory import get_object_store

    subdir = "input" if category == "input" else "output"
    store = get_object_store()
    if isinstance(store, LocalObjectStore):
        folder = store.root / subdir
        folder.mkdir(parents=True, exist_ok=True)
        return str(folder), subdir
    return (str(OUTPUT_INPUT_DIR), "input") if category == "input" else (str(OUTPUT_OUTPUT_DIR), "output")


def output_url_for(filename: str, category: str = "output") -> str:
    _, subdir = output_storage(category)
    return f"/assets/{subdir}/{filename}"


def output_path_for(filename: str, category: str = "output") -> str:
    folder, _ = output_storage(category)
    return os.path.join(folder, filename)


def library_storage_dir() -> str:
    from backend.storage.local_object_store import LocalObjectStore
    from backend.storage.object_store_factory import get_object_store

    store = get_object_store()
    if isinstance(store, LocalObjectStore):
        folder = store.root / "library"
        folder.mkdir(parents=True, exist_ok=True)
        return str(folder)
    return str(ASSET_LIBRARY_DIR)


def output_file_from_url(url: str | dict | None) -> str | None:
    from backend.services.object_store_media import resolve_asset_filesystem_path

    object_path = resolve_asset_filesystem_path(url)
    if object_path:
        return object_path
    if isinstance(url, dict):
        url = url.get("url", "")
    if not url or not (str(url).startswith("/output/") or str(url).startswith("/assets/")):
        return None
    clean = urllib.parse.unquote(str(url).split("?", 1)[0]).replace("\\", "/")
    if clean.startswith("/assets/"):
        roots = [ASSETS_DIR]
        if LEGACY_ASSETS_DIR is not None:
            roots.append(LEGACY_ASSETS_DIR)
        rel = clean[len("/assets/"):]
    else:
        roots = [OUTPUT_DIR]
        if LEGACY_OUTPUT_DIR is not None:
            roots.append(LEGACY_OUTPUT_DIR)
        rel = clean[len("/output/"):]
    rel = rel.lstrip("/")
    if not rel:
        return None
    for root in roots:
        path = os.path.abspath(os.path.join(str(root), rel))
        output_root = os.path.abspath(str(root))
        try:
            if os.path.commonpath([output_root, path]) == output_root and os.path.exists(path):
                return path
        except ValueError:
            continue
    return None


def filename_from_media_url(url: str, fallback: str = "download.bin") -> str:
    path = urllib.parse.urlsplit(str(url or "")).path
    name = os.path.basename(urllib.parse.unquote(path))
    return sanitize_export_filename(name or fallback, fallback)


def rewrite_runninghub_file_url(url: str) -> str:
    text = str(url or "")
    if not text:
        return text
    try:
        parsed = urllib.parse.urlsplit(text)
    except ValueError:
        return text
    target = RUNNINGHUB_FILE_HOST_REWRITES.get((parsed.netloc or "").lower())
    return parsed._replace(netloc=target).geturl() if target else text


def local_media_file_by_basename(name: str) -> str | None:
    safe = os.path.basename(urllib.parse.unquote(str(name or "")))
    if not safe:
        return None
    from backend.storage.local_object_store import LocalObjectStore
    from backend.storage.object_store_factory import get_object_store

    store = get_object_store()
    if isinstance(store, LocalObjectStore):
        for subdir in ("output", "input"):
            path = store.filesystem_path(f"{subdir}/{safe}")
            if path.is_file():
                return str(path)
    roots = [
        OUTPUT_OUTPUT_DIR,
        OUTPUT_INPUT_DIR,
        ASSETS_DIR / "output",
        ASSETS_DIR / "input",
        ASSET_LIBRARY_DIR,
    ]
    if LEGACY_ASSETS_DIR is not None:
        roots.extend(
            [
                LEGACY_ASSETS_DIR / "output",
                LEGACY_ASSETS_DIR / "input",
                LEGACY_ASSETS_DIR / "library",
            ]
        )
    for root in roots:
        path = os.path.abspath(os.path.join(str(root), safe))
        root_abs = os.path.abspath(str(root))
        if os.path.commonpath([root_abs, path]) == root_abs and os.path.isfile(path):
            return path
    return None


def content_type_for_path(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    mapping = {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".flv": "video/x-flv",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".gif": "image/gif",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".png": "image/png",
        ".txt": "text/plain; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
    }
    return mapping.get(ext, "application/octet-stream")


def asset_library_media_kind(path: str, content_type: str = "") -> str:
    ext = os.path.splitext(path or "")[1].lower()
    ct = (content_type or "").lower()
    if ext in {".json", ".zip"}:
        return "workflow"
    if ext in {".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"} or ct.startswith("video/"):
        return "video"
    if ext in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"} or ct.startswith("audio/"):
        return "audio"
    return "image"


def local_upload_kind_ext(filename: str, content_type: str) -> tuple[str | None, str]:
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".webm", ".mov", ".m4v", ".flv"}
    audio_exts = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
    ext = os.path.splitext(filename or "")[1].lower()
    ct = (content_type or "").lower()
    if ext in video_exts or ct.startswith("video/"):
        if ext not in video_exts:
            ext = ".webm" if "webm" in ct else ".mov" if "quicktime" in ct else ".mp4"
        return "video", ext
    if ext in audio_exts or ct.startswith("audio/"):
        if ext not in audio_exts:
            ext = ".wav" if "wav" in ct else ".ogg" if "ogg" in ct else ".m4a" if "mp4" in ct else ".mp3"
        return "audio", ext
    if ext in image_exts or ct.startswith("image/"):
        if ext not in image_exts:
            ext = ".jpg" if "jpeg" in ct else ".webp" if "webp" in ct else ".gif" if "gif" in ct else ".png"
        return "image", ext
    return None, ext


def fetch_remote_media_bytes(url: str, timeout: float = 30.0, max_bytes: int = 200 * 1024 * 1024):
    text = rewrite_runninghub_file_url(str(url or "").strip())
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    with requests.get(text, stream=True, timeout=timeout, headers={"User-Agent": "Infinite-Canvas/1.0"}) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type") or "application/octet-stream"
        chunks = []
        total = 0
        for chunk in response.iter_content(chunk_size=1024 * 256):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(status_code=413, detail="文件太大，无法下载")
            chunks.append(chunk)
    return b"".join(chunks), content_type


def asset_library_safe_extension(path: str, kind: str) -> str:
    ext = os.path.splitext(path or "")[1].lower()
    allowed = {
        "image": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
        "video": {".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"},
        "audio": {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"},
        "workflow": {".json", ".zip"},
    }
    fallback = {"image": ".png", "video": ".mp4", "audio": ".mp3", "workflow": ".zip"}
    return ext if ext in allowed.get(kind, allowed["image"]) else fallback.get(kind, ".png")
