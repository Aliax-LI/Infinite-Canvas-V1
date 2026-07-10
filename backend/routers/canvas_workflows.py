import os
import urllib.parse

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response

from backend.models.canvas_workflows import CanvasWorkflowExportRequest
from backend.services import asset_library_service, canvas_workflow_service
from backend.services.media_paths import sanitize_export_filename

router = APIRouter(tags=["canvas-workflows"])


@router.post("/api/canvas-workflows/export")
async def export_canvas_workflow(payload: CanvasWorkflowExportRequest) -> Response:
    archive, _ = canvas_workflow_service.build_canvas_workflow_archive(payload)
    filename = sanitize_export_filename(payload.filename or "canvas-workflow.zip", "canvas-workflow.zip")
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    encoded = urllib.parse.quote(filename)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    return Response(archive, media_type="application/zip", headers=headers)


@router.post("/api/canvas-workflows/export-to-library")
async def export_canvas_workflow_to_library(payload: CanvasWorkflowExportRequest) -> dict:
    archive, meta = canvas_workflow_service.build_canvas_workflow_archive(payload)
    filename = sanitize_export_filename(payload.filename or "canvas-workflow.zip", "canvas-workflow.zip")
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    lib = asset_library_service.load_asset_library()
    _, cat = asset_library_service.asset_library_workflow_category(lib, payload.library_id, payload.category_id)
    item = asset_library_service.make_workflow_library_item_from_bytes(archive, filename, payload.name or os.path.splitext(filename)[0])
    item["node_count"] = meta.get("node_count") or len(payload.nodes or [])
    item["connection_count"] = meta.get("connection_count") or len(payload.connections or [])
    item["resource_count"] = len(meta.get("resources") or [])
    cat.setdefault("items", []).append(item)
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "item": item}


@router.post("/api/canvas-workflows/import")
async def import_canvas_workflow(file: UploadFile = File(...)) -> dict:
    return await canvas_workflow_service.import_canvas_workflow_file(file)
