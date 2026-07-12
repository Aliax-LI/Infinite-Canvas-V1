"""Serve /assets/* from ObjectStore with legacy ASSETS_DIR fallback."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.config import ASSETS_DIR
from backend.services.media_paths import content_type_for_path
from backend.services.object_store_media import resolve_asset_filesystem_path

router = APIRouter(tags=["assets-static"])


@router.get("/assets/{asset_path:path}")
def serve_asset(asset_path: str) -> FileResponse:
    url = f"/assets/{asset_path.replace(chr(92), '/')}"
    object_path = resolve_asset_filesystem_path(url)
    if object_path and os.path.isfile(object_path):
        return FileResponse(object_path, media_type=content_type_for_path(object_path))
    legacy = (ASSETS_DIR / asset_path.replace("/", os.sep)).resolve()
    assets_root = ASSETS_DIR.resolve()
    try:
        if legacy.is_file() and os.path.commonpath([str(assets_root), str(legacy)]) == str(assets_root):
            return FileResponse(str(legacy), media_type=content_type_for_path(str(legacy)))
    except ValueError:
        pass
    raise HTTPException(status_code=404, detail="资源不存在")
