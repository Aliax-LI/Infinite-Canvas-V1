import json
import os
import shutil
import time
import uuid
import zipfile
from io import BytesIO

from fastapi import HTTPException, UploadFile

from backend.config import ASSETS_DIR, OUTPUT_INPUT_DIR
from backend.models.canvas_workflows import CanvasWorkflowExportRequest
from backend.services.common import now_ms
from backend.services.media_paths import output_file_from_url, sanitize_export_filename


def canvas_workflow_collect_resource_refs(value, found=None) -> list[str]:
    if found is None:
        found = []
    if isinstance(value, dict):
        for item in value.values():
            canvas_workflow_collect_resource_refs(item, found)
    elif isinstance(value, list):
        for item in value:
            canvas_workflow_collect_resource_refs(item, found)
    elif isinstance(value, str):
        text = value.strip()
        if (text.startswith("/assets/") or text.startswith("/output/")) and output_file_from_url(text):
            found.append(text)
    return found


def canvas_workflow_unique_archive_name(base: str, used: set[str]) -> str:
    safe = sanitize_export_filename(base, "resource.bin")
    name, ext = os.path.splitext(safe)
    archive = safe
    idx = 2
    while archive in used:
        archive = f"{name}-{idx}{ext}"
        idx += 1
    used.add(archive)
    return archive


def canvas_workflow_replace_strings(value, mapping: dict):
    if isinstance(value, dict):
        return {k: canvas_workflow_replace_strings(v, mapping) for k, v in value.items()}
    if isinstance(value, list):
        return [canvas_workflow_replace_strings(item, mapping) for item in value]
    if isinstance(value, str):
        return mapping.get(value, value)
    return value


def canvas_workflow_payload(nodes, connections, resources=None) -> dict:
    return {
        "format": "infinite-canvas-workflow",
        "version": 1,
        "exported_at": now_ms(),
        "nodes": nodes or [],
        "connections": connections or [],
        "resources": resources or [],
    }


def build_canvas_workflow_archive(payload: CanvasWorkflowExportRequest) -> tuple[bytes, dict]:
    nodes_payload = payload.nodes or []
    connections_payload = payload.connections or []
    if not nodes_payload:
        raise HTTPException(status_code=400, detail="没有可导出的节点")
    buffer = BytesIO()
    resources = []
    used: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if payload.include_resources:
            for url in canvas_workflow_collect_resource_refs(nodes_payload):
                if any(item.get("url") == url for item in resources):
                    continue
                path = output_file_from_url(url)
                if not path or not os.path.isfile(path):
                    continue
                archive_name = canvas_workflow_unique_archive_name(os.path.basename(path), used)
                archive_path = f"resources/{archive_name}"
                zf.write(path, archive_path)
                resources.append({
                    "url": url,
                    "archive": archive_path,
                    "name": os.path.basename(path),
                    "size": os.path.getsize(path),
                })
        workflow = canvas_workflow_payload(nodes_payload, connections_payload, resources)
        zf.writestr("workflow.json", json.dumps(workflow, ensure_ascii=False, indent=2))
    buffer.seek(0)
    return buffer.getvalue(), {
        "resources": resources,
        "node_count": len(nodes_payload),
        "connection_count": len(connections_payload),
    }


async def import_canvas_workflow_file(file: UploadFile) -> dict:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="文件为空")
    name = str(file.filename or "").lower()
    resource_mapping: dict[str, str] = {}
    workflow = None
    try:
        if name.endswith(".zip") or raw[:2] == b"PK":
            with zipfile.ZipFile(BytesIO(raw), "r") as zf:
                candidates = [n for n in zf.namelist() if n.lower().endswith("workflow.json")]
                workflow_name = "workflow.json" if "workflow.json" in zf.namelist() else (candidates[0] if candidates else "")
                if not workflow_name:
                    raise HTTPException(status_code=400, detail="压缩包中没有 workflow.json")
                workflow = json.loads(zf.read(workflow_name).decode("utf-8-sig"))
                stamp = time.strftime("%Y%m%d-%H%M%S")
                import_dir = os.path.join(str(OUTPUT_INPUT_DIR), f"workflow_import_{stamp}_{uuid.uuid4().hex[:6]}")
                os.makedirs(import_dir, exist_ok=True)
                for res in workflow.get("resources") or []:
                    archive = str(res.get("archive") or "").replace("\\", "/").lstrip("/")
                    if not archive or archive not in zf.namelist():
                        continue
                    base = sanitize_export_filename(res.get("name") or os.path.basename(archive), os.path.basename(archive) or "resource.bin")
                    target = os.path.join(import_dir, f"{uuid.uuid4().hex[:8]}_{base}")
                    with zf.open(archive) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    rel = os.path.relpath(target, str(ASSETS_DIR)).replace("\\", "/")
                    new_url = f"/assets/{rel}"
                    old_url = str(res.get("url") or "").strip()
                    if old_url:
                        resource_mapping[old_url] = new_url
                    resource_mapping[archive] = new_url
                    resource_mapping[f"./{archive}"] = new_url
                    resource_mapping[os.path.basename(archive)] = new_url
        else:
            workflow = json.loads(raw.decode("utf-8-sig"))
    except HTTPException:
        raise
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="无法读取压缩包") from exc
    except (OSError, json.JSONDecodeError, ValueError, TypeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"无法解析工作流文件：{exc}") from exc
    if isinstance(workflow, list):
        workflow = {"nodes": workflow, "connections": []}
    if not isinstance(workflow, dict):
        raise HTTPException(status_code=400, detail="工作流格式不正确")
    nodes_payload = workflow.get("nodes")
    connections_payload = workflow.get("connections")
    if nodes_payload is None and isinstance(workflow.get("workflow"), dict):
        nodes_payload = workflow["workflow"].get("nodes")
        connections_payload = workflow["workflow"].get("connections")
    if not isinstance(nodes_payload, list):
        raise HTTPException(status_code=400, detail="工作流 JSON 缺少 nodes")
    if not isinstance(connections_payload, list):
        connections_payload = []
    if resource_mapping:
        nodes_payload = canvas_workflow_replace_strings(nodes_payload, resource_mapping)
        connections_payload = canvas_workflow_replace_strings(connections_payload, resource_mapping)
    return {
        "workflow": canvas_workflow_payload(nodes_payload, connections_payload, workflow.get("resources") or []),
        "nodes": nodes_payload,
        "connections": connections_payload,
        "resource_map": resource_mapping,
    }
