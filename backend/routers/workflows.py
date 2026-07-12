import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.models.workflows import WorkflowConfig, WorkflowRunRequest, WorkflowUploadRequest
from backend.services import workflow_service
from backend.services.media_paths import sanitize_export_filename
from backend.services.workflow_export import build_workflow_export_payload

router = APIRouter(tags=["workflows"])

@router.get("/api/workflows")
async def list_workflows() -> dict:
    return {"workflows": workflow_service.list_workflows()}


@router.get("/api/workflows/{name:path}/download")
async def download_workflow(name: str) -> Response:
    """Export the generate workflow as ComfyUI UI-format JSON (missing-node friendly)."""
    payload, raw_filename = build_workflow_export_payload(name)
    filename = sanitize_export_filename(raw_filename, "workflow.json")
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/api/workflows/{name:path}")
async def get_workflow(name: str) -> dict:
    return workflow_service.get_workflow(name)


@router.post("/api/workflows")
async def upload_workflow(payload: WorkflowUploadRequest) -> dict:
    stored_name = workflow_service.save_workflow_upload(payload.name, payload.workflow)
    return {"name": stored_name}


@router.put("/api/workflows/{name:path}/config")
async def save_workflow_config(name: str, payload: WorkflowConfig) -> dict:
    config = workflow_service.save_workflow_config(name, payload.model_dump())
    return {"config": config}


@router.delete("/api/workflows/{name:path}")
async def delete_workflow(name: str) -> dict:
    workflow_service.delete_workflow(name)
    return {"ok": True}


@router.post("/api/workflows/{name:path}/run")
async def run_workflow(name: str, payload: WorkflowRunRequest) -> dict:
    return workflow_service.run_workflow_from_config(name, payload)
