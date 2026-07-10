import json
import os
import uuid
from typing import Any

from backend.config import CANVAS_DIR, DEFAULT_PROJECT_ID, PROJECTS_PATH, ensure_data_dirs
from backend.services.common import CANVAS_LOCK, now_ms


def load_projects() -> list[dict[str, Any]]:
    try:
        with open(PROJECTS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        projects = data.get("projects") if isinstance(data, dict) else data
        if isinstance(projects, list):
            return [p for p in projects if isinstance(p, dict) and p.get("id")]
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return []
    return []


def save_projects(projects: list[dict[str, Any]]) -> None:
    ensure_data_dirs()
    with CANVAS_LOCK:
        with open(PROJECTS_PATH, "w", encoding="utf-8") as f:
            json.dump({"projects": projects}, f, ensure_ascii=False, indent=2)


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
    moved = 0
    ensure_data_dirs()
    with CANVAS_LOCK:
        for filename in os.listdir(CANVAS_DIR):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(CANVAS_DIR, filename)
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError, ValueError, TypeError):
                continue
            if str(data.get("project") or "") == project_id:
                data["project"] = DEFAULT_PROJECT_ID
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                moved += 1
    return {"ok": True, "moved": moved}
