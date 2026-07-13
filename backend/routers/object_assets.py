"""Serve /assets/* from ObjectStore with ASSETS_DIR / legacy repo assets fallback."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.config import ASSETS_DIR, LEGACY_ASSETS_DIR
from backend.services.media_paths import content_type_for_path
from backend.services.object_store_media import resolve_asset_filesystem_path

router = APIRouter(tags=["assets-static"])


def _file_under_root(root: Path | None, asset_path: str) -> str | None:
    if root is None:
        return None
    candidate = (root / asset_path.replace("/", os.sep)).resolve()
    root_abs = root.resolve()
    try:
        if candidate.is_file() and os.path.commonpath([str(root_abs), str(candidate)]) == str(root_abs):
            return str(candidate)
    except ValueError:
        return None
    return None


@router.get("/assets/{asset_path:path}")
def serve_asset(asset_path: str) -> FileResponse:
    url = f"/assets/{asset_path.replace(chr(92), '/')}"
    object_path = resolve_asset_filesystem_path(url)
    if object_path and os.path.isfile(object_path):
        return FileResponse(object_path, media_type=content_type_for_path(object_path))
    for root in (ASSETS_DIR, LEGACY_ASSETS_DIR):
        path = _file_under_root(root, asset_path)
        if path:
            return FileResponse(path, media_type=content_type_for_path(path))
    raise HTTPException(status_code=404, detail="资源不存在")
