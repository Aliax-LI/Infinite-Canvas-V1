import json
import os
import urllib.parse
import uuid
from threading import Lock

from fastapi import HTTPException

from backend.config import BASE_DIR, DATA_DIR, SHARED_FOLDERS_PATH, ensure_data_dirs
from backend.services.common import now_ms
from backend.services.media_paths import asset_library_media_kind, content_type_for_path, sanitize_asset_name

SHARED_MEDIA_EXTS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
    ".mp4", ".webm", ".mov", ".m4v", ".mkv",
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
}
SHARED_SCAN_MAX_ENTRIES = 8000
SHARED_FOLDERS_LOCK = Lock()


def shared_folders_load() -> dict:
    ensure_data_dirs()
    try:
        with open(SHARED_FOLDERS_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, OSError, json.JSONDecodeError, ValueError, TypeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    folders = data.get("folders")
    if not isinstance(folders, list):
        folders = []
    return {"folders": [entry for entry in folders if isinstance(entry, dict)]}


def shared_folders_save(data: dict) -> None:
    ensure_data_dirs()
    with open(SHARED_FOLDERS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def shared_folder_by_id(folder_id: str):
    for entry in shared_folders_load().get("folders", []):
        if entry.get("id") == folder_id:
            return entry
    return None


def shared_folder_abs(entry) -> str:
    rel = (entry or {}).get("rel") or ""
    return os.path.normpath(os.path.join(str(BASE_DIR), rel))


def shared_resolve_register(path: str):
    raw = (path or "").strip().strip('"').strip("'")
    if not raw:
        raise HTTPException(status_code=400, detail="请提供文件夹路径")
    candidate = raw if os.path.isabs(raw) else os.path.join(str(BASE_DIR), raw)
    abs_path = os.path.normpath(os.path.abspath(candidate))
    base = os.path.normpath(os.path.abspath(str(BASE_DIR)))
    try:
        common = os.path.commonpath([abs_path, base])
    except ValueError:
        raise HTTPException(status_code=400, detail="只允许登记项目目录内的文件夹")
    if common != base:
        raise HTTPException(status_code=400, detail="只允许登记项目目录内的文件夹")
    if abs_path == base:
        raise HTTPException(status_code=400, detail="不能直接登记项目根目录，请选择子文件夹")
    if not os.path.isdir(abs_path):
        raise HTTPException(status_code=400, detail="文件夹不存在")
    rel = os.path.relpath(abs_path, base)
    return abs_path, rel


def shared_child_abs(folder_abs: str, rel: str) -> str:
    rel = (rel or "").replace("\\", "/").lstrip("/")
    abs_path = os.path.normpath(os.path.join(folder_abs, rel))
    base = os.path.normpath(os.path.abspath(folder_abs))
    try:
        common = os.path.commonpath([os.path.abspath(abs_path), base])
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    if common != base:
        raise HTTPException(status_code=400, detail="非法路径")
    return abs_path


def scan_shared_tree(folder_id: str, folder_abs: str, rel_prefix: str = "", display: str = "", counter=None):
    if counter is None:
        counter = {"n": 0}
    node = {
        "id": f"{folder_id}:{rel_prefix or '__root__'}",
        "name": display or os.path.basename(folder_abs) or folder_abs,
        "path": rel_prefix,
        "items": [],
        "children": [],
    }
    try:
        entries = sorted(os.scandir(folder_abs), key=lambda e: (not e.is_dir(), e.name.lower()))
    except OSError:
        return node
    for ent in entries:
        if counter["n"] >= SHARED_SCAN_MAX_ENTRIES:
            break
        if ent.name.startswith(".") or ent.name.startswith("._"):
            continue
        child_rel = f"{rel_prefix}/{ent.name}".lstrip("/")
        if ent.is_dir():
            child = scan_shared_tree(folder_id, ent.path, child_rel, ent.name, counter)
            if child["items"] or child["children"]:
                node["children"].append(child)
        elif ent.is_file():
            ext = os.path.splitext(ent.name)[1].lower()
            if ext not in SHARED_MEDIA_EXTS:
                continue
            counter["n"] += 1
            try:
                st = ent.stat()
                size = st.st_size
                mtime = int(st.st_mtime * 1000)
            except OSError:
                size = 0
                mtime = 0
            node["items"].append({
                "id": f"{folder_id}:{child_rel}",
                "name": ent.name,
                "url": f"/api/shared-folders/{folder_id}/file?path={urllib.parse.quote(child_rel)}",
                "kind": asset_library_media_kind(ent.name),
                "size": size,
                "lastModified": mtime,
                "relativePath": child_rel,
                "folderId": folder_id,
            })
    return node
