import json
import os
import re

from fastapi import HTTPException

from backend.config import WORKFLOW_DIR

BUILTIN_WORKFLOWS = {"Z-Image.json", "Z-Image-Enhance.json", "2511.json", "klein-enhance.json", "Flux2-Klein.json", "upscale.json"}
CUSTOM_WORKFLOW_FOLDER = "custom"
LEGACY_CUSTOM_WORKFLOW_FOLDER = "自定义"
WORKFLOW_NAME_RE = re.compile(
    rf"^(?:(?:{CUSTOM_WORKFLOW_FOLDER}|{LEGACY_CUSTOM_WORKFLOW_FOLDER})/)?[a-zA-Z0-9_一-龥.\-]+\.json$"
)


def workflow_path_from_name(name: str) -> str:
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    path = os.path.abspath(os.path.join(str(WORKFLOW_DIR), *name.split("/")))
    workflow_root = os.path.abspath(str(WORKFLOW_DIR))
    if os.path.commonpath([workflow_root, path]) != workflow_root:
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    return path


def workflow_config_path(name: str) -> str:
    return workflow_path_from_name(name).replace(".json", ".config.json")


def is_builtin_workflow(name: str) -> bool:
    return "/" not in name and os.path.basename(name) in BUILTIN_WORKFLOWS


def list_workflows() -> list[dict]:
    if not WORKFLOW_DIR.is_dir():
        return []
    items: list[dict] = []
    for root, dirs, files in os.walk(str(WORKFLOW_DIR)):
        if os.path.abspath(root) == os.path.abspath(str(WORKFLOW_DIR)):
            dirs[:] = [d for d in dirs if d in {CUSTOM_WORKFLOW_FOLDER, LEGACY_CUSTOM_WORKFLOW_FOLDER}]
        for fn in sorted(files):
            if not fn.endswith(".json") or fn.endswith(".config.json"):
                continue
            rel = os.path.relpath(os.path.join(root, fn), str(WORKFLOW_DIR)).replace("\\", "/")
            if is_builtin_workflow(rel):
                continue
            cfg = {}
            cfg_path = workflow_config_path(rel)
            if os.path.exists(cfg_path):
                try:
                    with open(cfg_path, encoding="utf-8") as f:
                        cfg = json.load(f) or {}
                except (OSError, json.JSONDecodeError, ValueError, TypeError):
                    cfg = {}
            items.append({
                "name": rel,
                "title": cfg.get("title") or fn.replace(".json", ""),
                "builtin": False,
                "field_count": len(cfg.get("fields") or []),
            })
    items.sort(key=lambda item: (0 if item["name"].startswith(f"{CUSTOM_WORKFLOW_FOLDER}/") else 1, item["title"]))
    return items


def get_workflow(name: str) -> dict:
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    with open(workflow_path, encoding="utf-8") as f:
        workflow = json.load(f)
    cfg = {"title": name.replace(".json", ""), "fields": []}
    cfg_path = workflow_config_path(name)
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, encoding="utf-8") as f:
                cfg = json.load(f) or cfg
        except (OSError, json.JSONDecodeError, ValueError, TypeError):
            pass
    return {"name": name, "workflow": workflow, "config": cfg, "builtin": is_builtin_workflow(name)}


def save_workflow_upload(name: str, workflow: dict) -> str:
    base = os.path.basename(name.strip())
    if not base.endswith(".json"):
        base += ".json"
    if not WORKFLOW_NAME_RE.match(base) and not WORKFLOW_NAME_RE.match(f"{CUSTOM_WORKFLOW_FOLDER}/{base}"):
        if not WORKFLOW_NAME_RE.match(base):
            raise HTTPException(status_code=400, detail="工作流名称不合法，请使用中文/英文/数字/_-.")
    if not isinstance(workflow, dict) or not workflow:
        raise HTTPException(status_code=400, detail="工作流 JSON 为空")
    sample = next(iter(workflow.values()), None)
    if not isinstance(sample, dict) or "class_type" not in sample:
        raise HTTPException(status_code=400, detail="不是有效的 ComfyUI API 工作流 JSON（需包含 class_type）")
    custom_dir = WORKFLOW_DIR / CUSTOM_WORKFLOW_FOLDER
    custom_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{CUSTOM_WORKFLOW_FOLDER}/{base}"
    path = workflow_path_from_name(stored_name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, ensure_ascii=False, indent=2)
    return stored_name


def save_workflow_config(name: str, config: dict) -> dict:
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    cfg_path = workflow_config_path(name)
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    return config


def delete_workflow(name: str) -> None:
    if is_builtin_workflow(name):
        raise HTTPException(status_code=400, detail="内置工作流不可删除")
    workflow_path = workflow_path_from_name(name)
    cfg_path = workflow_config_path(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    os.remove(workflow_path)
    if os.path.exists(cfg_path):
        os.remove(cfg_path)


import uuid

from backend.models.generate import GenerateRequest
from backend.models.workflows import WorkflowRunRequest


def _coerce_workflow_field_value(field, value):
    if field.type in ("number", "slider"):
        try:
            return float(value) if (field.step and field.step < 1) else int(float(value))
        except (TypeError, ValueError):
            return value
    if field.type == "boolean":
        return bool(value)
    if field.type == "dropdown" and isinstance(value, str):
        s = value.strip()
        try:
            if s and ("." in s or "e" in s.lower()):
                return float(s)
            if s and s.lstrip("-").isdigit():
                return int(s)
        except (ValueError, TypeError):
            pass
    return value


def run_workflow_from_config(name: str, payload: WorkflowRunRequest) -> dict:
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    params: dict[str, dict] = {}
    for field in payload.config.fields:
        if not field.node or not field.input:
            continue
        if field.id not in payload.fields:
            continue
        value = _coerce_workflow_field_value(field, payload.fields[field.id])
        params.setdefault(field.node, {})[field.input] = value
    from backend.services import comfy_generate_service

    req = GenerateRequest(
        prompt="",
        workflow_json=name,
        params=params,
        type="workflow-test",
        client_id=payload.client_id or str(uuid.uuid4()),
    )
    return comfy_generate_service.comfy_generate(req)
