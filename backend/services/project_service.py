import uuid
from typing import Any

from backend.config import DEFAULT_PROJECT_ID
from backend.repositories import get_project_repository
from backend.services.common import now_ms


def load_projects() -> list[dict[str, Any]]:
    return get_project_repository().load_all()


def save_projects(projects: list[dict[str, Any]]) -> None:
    get_project_repository().save_all(projects)


def project_record(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project.get("id"),
        "name": (project.get("name") or "未命名项目")[:60],
        "order": int(project.get("order") or 0),
        "created_at": project.get("created_at", 0),
        "updated_at": project.get("updated_at", 0),
    }


def ensure_default_project() -> list[dict[str, Any]]:
    projects = load_projects()
    changed = False
    if not any(p.get("id") == DEFAULT_PROJECT_ID for p in projects):
        ts = now_ms()
        projects.insert(0, {
            "id": DEFAULT_PROJECT_ID,
            "name": "默认项目",
            "order": 0,
            "created_at": ts,
            "updated_at": ts,
        })
        changed = True
    if changed:
        save_projects(projects)
    return projects


def new_project(name: str = "新项目") -> dict[str, Any]:
    projects = ensure_default_project()
    ts = now_ms()
    clean = (str(name or "").strip() or "新项目")[:60]
    order = max([int(p.get("order") or 0) for p in projects], default=0) + 1
    project = {"id": uuid.uuid4().hex, "name": clean, "order": order, "created_at": ts, "updated_at": ts}
    projects.append(project)
    save_projects(projects)
    return project


def list_projects() -> list[dict[str, Any]]:
    from backend.services.canvas_service import iter_canvas_records

    projects = ensure_default_project()
    counts: dict[str, int] = {}
    for rec in iter_canvas_records(include_deleted=False):
        pid = rec.get("project") or DEFAULT_PROJECT_ID
        counts[pid] = counts.get(pid, 0) + 1
    out = []
    for project in sorted(projects, key=lambda x: (int(x.get("order") or 0), x.get("created_at") or 0)):
        rec = project_record(project)
        rec["canvas_count"] = counts.get(rec["id"], 0)
        out.append(rec)
    return out


def update_project(project_id: str, name: str | None = None, order: int | None = None) -> dict[str, Any]:
    from fastapi import HTTPException

    projects = ensure_default_project()
    target = next((p for p in projects if p.get("id") == project_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="项目不存在")
    if name is not None:
        target["name"] = (str(name).strip() or target.get("name") or "未命名项目")[:60]
    if order is not None:
        target["order"] = int(order)
    target["updated_at"] = now_ms()
    save_projects(projects)
    return project_record(target)


def delete_project(project_id: str) -> dict[str, Any]:
    from fastapi import HTTPException

    if project_id == DEFAULT_PROJECT_ID:
        raise HTTPException(status_code=400, detail="默认项目不可删除")
    projects = ensure_default_project()
    if not any(p.get("id") == project_id for p in projects):
        raise HTTPException(status_code=404, detail="项目不存在")
    projects = [p for p in projects if p.get("id") != project_id]
    save_projects(projects)
    moved = get_project_repository().reassign_canvases(project_id, DEFAULT_PROJECT_ID)
    return {"ok": True, "moved": moved}
