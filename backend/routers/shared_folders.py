import os
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.models.shared_folders import SharedFolderImport, SharedFolderRegister
from backend.services import asset_library_service, shared_folders_service
from backend.services.common import now_ms
from backend.services.media_paths import content_type_for_path, sanitize_asset_name

router = APIRouter(tags=["shared-folders"])


@router.get("/api/shared-folders")
async def list_shared_folders() -> dict:
    data = shared_folders_service.shared_folders_load()
    folders = []
    for entry in data.get("folders", []):
        abs_path = shared_folders_service.shared_folder_abs(entry)
        folders.append({
            "id": entry.get("id"),
            "name": entry.get("name") or os.path.basename(abs_path) or abs_path,
            "rel": entry.get("rel") or "",
            "path": abs_path,
            "exists": os.path.isdir(abs_path),
            "created_at": entry.get("created_at"),
        })
    return {"folders": folders}


@router.post("/api/shared-folders")
async def register_shared_folder(payload: SharedFolderRegister) -> dict:
    abs_path, rel = shared_folders_service.shared_resolve_register(payload.path)
    name = sanitize_asset_name(payload.name or os.path.basename(abs_path), "共享文件夹")
    with shared_folders_service.SHARED_FOLDERS_LOCK:
        data = shared_folders_service.shared_folders_load()
        for entry in data.get("folders", []):
            if os.path.normpath(shared_folders_service.shared_folder_abs(entry)) == os.path.normpath(abs_path):
                entry["name"] = name
                shared_folders_service.shared_folders_save(data)
                return {"folder": {**entry, "path": abs_path, "exists": True}}
        entry = {
            "id": f"shared_{uuid.uuid4().hex[:12]}",
            "name": name,
            "rel": rel,
            "created_at": now_ms(),
        }
        data.setdefault("folders", []).append(entry)
        shared_folders_service.shared_folders_save(data)
    return {"folder": {**entry, "path": abs_path, "exists": True}}


@router.delete("/api/shared-folders/{folder_id}")
async def unregister_shared_folder(folder_id: str) -> dict:
    with shared_folders_service.SHARED_FOLDERS_LOCK:
        data = shared_folders_service.shared_folders_load()
        before = len(data.get("folders", []))
        data["folders"] = [f for f in data.get("folders", []) if f.get("id") != folder_id]
        if len(data["folders"]) == before:
            raise HTTPException(status_code=404, detail="共享文件夹不存在")
        shared_folders_service.shared_folders_save(data)
    return {"ok": True}


@router.get("/api/shared-folders/{folder_id}/tree")
async def get_shared_folder_tree(folder_id: str) -> dict:
    entry = shared_folders_service.shared_folder_by_id(folder_id)
    if not entry:
        raise HTTPException(status_code=404, detail="共享文件夹不存在")
    abs_path = shared_folders_service.shared_folder_abs(entry)
    if not os.path.isdir(abs_path):
        raise HTTPException(status_code=404, detail="文件夹已不存在")
    tree = shared_folders_service.scan_shared_tree(folder_id, abs_path, "", entry.get("name") or os.path.basename(abs_path))
    return {"folder": {"id": folder_id, "name": entry.get("name"), "path": abs_path}, "tree": tree}


@router.get("/api/shared-folders/{folder_id}/file")
async def get_shared_folder_file(folder_id: str, path: str = "") -> FileResponse:
    entry = shared_folders_service.shared_folder_by_id(folder_id)
    if not entry:
        raise HTTPException(status_code=404, detail="共享文件夹不存在")
    folder_abs = shared_folders_service.shared_folder_abs(entry)
    abs_path = shared_folders_service.shared_child_abs(folder_abs, path)
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in shared_folders_service.SHARED_MEDIA_EXTS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    return FileResponse(abs_path, media_type=content_type_for_path(abs_path))


@router.post("/api/shared-folders/import")
async def import_shared_folder_files(payload: SharedFolderImport) -> dict:
    entry = shared_folders_service.shared_folder_by_id(payload.folder_id)
    if not entry:
        raise HTTPException(status_code=404, detail="共享文件夹不存在")
    folder_abs = shared_folders_service.shared_folder_abs(entry)
    lib = asset_library_service.load_asset_library()
    cat = asset_library_service.find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    added = []
    for rel in (payload.paths or [])[:200]:
        abs_path = shared_folders_service.shared_child_abs(folder_abs, rel)
        if not os.path.isfile(abs_path):
            continue
        ext = os.path.splitext(abs_path)[1].lower()
        if ext not in shared_folders_service.SHARED_MEDIA_EXTS:
            continue
        _, item = asset_library_service.make_asset_library_item(abs_path, os.path.basename(abs_path), subdir=cat.get("dir") or "")
        cat.setdefault("items", []).append(item)
        added.append(item)
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "items": added}
