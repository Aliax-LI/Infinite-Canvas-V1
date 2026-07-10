from typing import Any

from fastapi import APIRouter

from backend.models.canvas import ProjectCreateRequest, ProjectUpdateRequest
from backend.services import project_service

router = APIRouter(tags=["projects"])


@router.get("/api/projects")
async def get_projects() -> dict[str, Any]:
    return {"projects": project_service.list_projects()}


@router.post("/api/projects")
async def create_project(payload: ProjectCreateRequest) -> dict[str, Any]:
    return {"project": project_service.project_record(project_service.new_project(payload.name))}


@router.post("/api/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdateRequest) -> dict[str, Any]:
    return {
        "project": project_service.update_project(
            project_id,
            name=payload.name,
            order=payload.order,
        )
    }


@router.delete("/api/projects/{project_id}")
async def delete_project(project_id: str) -> dict[str, Any]:
    return project_service.delete_project(project_id)
