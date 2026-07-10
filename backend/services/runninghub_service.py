import json
import os
import re
import urllib.parse
import uuid
from threading import Lock

import httpx
from fastapi import HTTPException

from backend.config import (
    OUTPUT_INPUT_DIR,
    OUTPUT_OUTPUT_DIR,
    RUNNINGHUB_DEFAULT_BASE_URL,
    RUNNINGHUB_WORKFLOW_STORE_PATH,
    ensure_data_dirs,
)
from backend.services.api_providers_service import (
    bearer_auth_value,
    get_api_provider_exact,
    load_api_providers,
    normalize_provider,
    provider_env_key_value,
    provider_key_env,
    runninghub_wallet_key_env,
    save_api_providers,
)
from backend.services.common import now_ms
from backend.services.media_paths import (
    content_type_for_path,
    output_file_from_url,
    output_path_for,
    output_url_for,
    rewrite_runninghub_file_url,
)

RUNNINGHUB_WORKFLOW_LOCK = Lock()


def runninghub_workflow_store_key(workflow_id: str) -> str:
    return str(workflow_id or "").strip()


def load_runninghub_workflow_store() -> dict:
    ensure_data_dirs()
    if not RUNNINGHUB_WORKFLOW_STORE_PATH.is_file():
        return {}
    try:
        with open(RUNNINGHUB_WORKFLOW_STORE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return {}


def save_runninghub_workflow_store(store: dict) -> None:
    ensure_data_dirs()
    with open(RUNNINGHUB_WORKFLOW_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)


def runninghub_workflow_config_has_payload(cfg) -> bool:
    return isinstance(cfg, dict) and bool(cfg.get("fields") or cfg.get("workflowJson") or cfg.get("raw"))


def runninghub_is_workflow_link_value(value) -> bool:
    return isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and isinstance(value[1], int)


def runninghub_normalize_field(raw, fallback=None) -> dict:
    fallback = fallback or {}
    if hasattr(raw, "model_dump"):
        raw = raw.model_dump()
    elif hasattr(raw, "dict"):
        raw = raw.dict()
    if not isinstance(raw, dict):
        raw = {}
    field_id = str(raw.get("id") or raw.get("fieldId") or fallback.get("id") or "").strip()
    node_id = str(raw.get("nodeId") or fallback.get("nodeId") or "").strip()
    field_name = str(raw.get("fieldName") or raw.get("name") or fallback.get("fieldName") or "").strip()
    field_value = raw.get("fieldValue")
    if field_value is None:
        field_value = fallback.get("fieldValue", "")
    if isinstance(field_value, (dict, list)):
        field_value = json.dumps(field_value, ensure_ascii=False)
    else:
        field_value = str(field_value or "")
    return {
        "id": field_id or f"{node_id}::{field_name}",
        "nodeId": node_id,
        "fieldName": field_name,
        "fieldValue": field_value,
        "fieldType": str(raw.get("fieldType") or fallback.get("fieldType") or "TEXT"),
        "label": str(raw.get("label") or field_name or ""),
        "enabled": bool(raw.get("enabled", True)),
        "sourceFromUpstream": bool(raw.get("sourceFromUpstream", True)),
        "group": str(raw.get("group") or ""),
        "note": str(raw.get("note") or ""),
        "options": list(raw.get("options") or []),
        "random_enabled": bool(raw.get("random_enabled", False)),
        "min": raw.get("min", ""),
        "max": raw.get("max", ""),
        "step": raw.get("step", ""),
        "imageOrder": int(raw.get("imageOrder") or 0),
        "required": bool(raw.get("required", False)),
    }


def runninghub_is_saved_link_field(field) -> bool:
    if not isinstance(field, dict):
        return False
    value = field.get("fieldValue")
    if not isinstance(value, str) or not (value.strip().startswith("[") and value.strip().endswith("]")):
        return False
    try:
        return runninghub_is_workflow_link_value(json.loads(value))
    except (json.JSONDecodeError, ValueError, TypeError):
        return False


def runninghub_saved_hidden_workflow_ids() -> set[str]:
    hidden = set()
    for provider in load_api_providers():
        if provider.get("id") != "runninghub":
            continue
        for entry in provider.get("rh_workflows") or []:
            if entry.get("hidden") is True:
                key = runninghub_workflow_store_key(entry.get("workflowId") or entry.get("id"))
                if key:
                    hidden.add(key)
    return hidden


def runninghub_provider_workflow_config(workflow_id: str):
    key = runninghub_workflow_store_key(workflow_id)
    if not key or key in runninghub_saved_hidden_workflow_ids():
        return None
    provider = next((item for item in load_api_providers() if item.get("id") == "runninghub"), None)
    if not provider:
        return None
    for entry in provider.get("rh_workflows") or []:
        entry_key = runninghub_workflow_store_key(entry.get("workflowId") or entry.get("id"))
        if entry_key != key or entry.get("hidden") is True:
            continue
        cfg = {
            "workflowId": key,
            "title": entry.get("title") or key,
            "description": entry.get("note") or entry.get("description") or "",
            "fields": [f for f in (runninghub_normalize_field(item) for item in (entry.get("fields") or [])) if not runninghub_is_saved_link_field(f)],
            "workflowJson": entry.get("workflowJson") if isinstance(entry.get("workflowJson"), dict) else {},
            "optionalImageMode": entry.get("optionalImageMode") or "prune-workflow",
            "raw": entry.get("raw") if isinstance(entry.get("raw"), dict) else {},
            "updatedAt": entry.get("updatedAt") or 0,
        }
        return cfg if runninghub_workflow_config_has_payload(cfg) else None
    return None


def runninghub_select_workflow_config(local_cfg, provider_cfg, workflow_id: str = ""):
    if isinstance(local_cfg, dict) and isinstance(provider_cfg, dict):
        local_updated = int(local_cfg.get("updatedAt") or 0)
        provider_updated = int(provider_cfg.get("updatedAt") or 0)
        return provider_cfg if provider_updated > local_updated else local_cfg
    return local_cfg if isinstance(local_cfg, dict) else provider_cfg if isinstance(provider_cfg, dict) else None


def list_runninghub_workflow_items() -> list[dict]:
    hidden_ids = runninghub_saved_hidden_workflow_ids()
    with RUNNINGHUB_WORKFLOW_LOCK:
        store = load_runninghub_workflow_store()
    merged = {wid: cfg for wid, cfg in store.items() if isinstance(cfg, dict) and wid not in hidden_ids}
    for provider in load_api_providers():
        if provider.get("id") != "runninghub":
            continue
        for entry in provider.get("rh_workflows") or []:
            workflow_id = runninghub_workflow_store_key(entry.get("workflowId") or entry.get("id"))
            if not workflow_id or entry.get("hidden") is True:
                continue
            provider_cfg = runninghub_provider_workflow_config(workflow_id)
            if provider_cfg:
                merged[workflow_id] = runninghub_select_workflow_config(merged.get(workflow_id), provider_cfg, workflow_id)
    items = []
    for workflow_id, cfg in merged.items():
        if not isinstance(cfg, dict):
            continue
        items.append({
            "workflowId": workflow_id,
            "title": cfg.get("title") or workflow_id,
            "fieldCount": len(cfg.get("fields") or []),
            "updatedAt": cfg.get("updatedAt"),
            "description": cfg.get("description") or "",
        })
    items.sort(key=lambda item: item["title"])
    return items


def get_runninghub_workflow(workflow_id: str) -> dict:
    key = runninghub_workflow_store_key(workflow_id)
    if not key:
        raise HTTPException(status_code=400, detail="workflowId 必填")
    with RUNNINGHUB_WORKFLOW_LOCK:
        store = load_runninghub_workflow_store()
    cfg = store.get(key)
    provider_cfg = runninghub_provider_workflow_config(key)
    cfg = runninghub_select_workflow_config(cfg, provider_cfg, key)
    if not isinstance(cfg, dict):
        raise HTTPException(status_code=404, detail="RunningHub 工作流未找到")
    return cfg


def save_runninghub_workflow(workflow_id: str, payload) -> dict:
    key = runninghub_workflow_store_key(workflow_id)
    if not key:
        raise HTTPException(status_code=400, detail="workflowId 必填")
    fields = [f for f in (runninghub_normalize_field(item) for item in (payload.fields or [])) if not runninghub_is_saved_link_field(f)]
    cfg = {
        "workflowId": key,
        "title": (payload.title or key).strip() or key,
        "description": payload.description or "",
        "fields": fields,
        "workflowJson": payload.workflowJson or {},
        "optionalImageMode": payload.optionalImageMode or "prune-workflow",
        "raw": payload.raw or {},
        "updatedAt": now_ms(),
    }
    with RUNNINGHUB_WORKFLOW_LOCK:
        store = load_runninghub_workflow_store()
        store[key] = cfg
        save_runninghub_workflow_store(store)
    sync_runninghub_workflow_to_provider(cfg)
    return cfg


def delete_runninghub_workflow(workflow_id: str) -> None:
    key = runninghub_workflow_store_key(workflow_id)
    if not key:
        raise HTTPException(status_code=400, detail="workflowId 必填")
    with RUNNINGHUB_WORKFLOW_LOCK:
        store = load_runninghub_workflow_store()
        provider_cfg = runninghub_provider_workflow_config(key)
        if key not in store and not provider_cfg:
            raise HTTPException(status_code=404, detail="RunningHub 工作流未找到")
        store.pop(key, None)
        save_runninghub_workflow_store(store)
    remove_runninghub_workflow_from_provider(key)


def sync_runninghub_workflow_to_provider(cfg: dict) -> None:
    if not isinstance(cfg, dict):
        return
    key = runninghub_workflow_store_key(cfg.get("workflowId"))
    if not key:
        return
    providers = load_api_providers()
    provider = next((item for item in providers if item.get("id") == "runninghub"), None)
    if not provider:
        provider = {"id": "runninghub", "name": "RunningHub", "base_url": RUNNINGHUB_DEFAULT_BASE_URL, "protocol": "runninghub", "enabled": True, "primary": False, "image_models": [], "chat_models": [], "video_models": [], "rh_apps": [], "rh_workflows": []}
        providers.append(provider)
    workflows = provider.setdefault("rh_workflows", [])
    entry = next((item for item in workflows if runninghub_workflow_store_key(item.get("workflowId") or item.get("id")) == key), None)
    if entry is None:
        entry = {"id": key, "workflowId": key, "title": cfg.get("title") or key, "note": "", "enabled": True}
        workflows.append(entry)
    entry.update({
        "id": key, "workflowId": key,
        "title": cfg.get("title") or entry.get("title") or key,
        "note": cfg.get("description") or "",
        "fields": [f for f in (runninghub_normalize_field(item) for item in (cfg.get("fields") or [])) if not runninghub_is_saved_link_field(f)],
        "workflowJson": cfg.get("workflowJson") if isinstance(cfg.get("workflowJson"), dict) else {},
        "updatedAt": cfg.get("updatedAt") or now_ms(),
    })
    save_api_providers([normalize_provider(item) for item in providers])


def remove_runninghub_workflow_from_provider(workflow_id: str) -> None:
    key = runninghub_workflow_store_key(workflow_id)
    if not key:
        return
    providers = load_api_providers()
    changed = False
    for provider in providers:
        if provider.get("id") != "runninghub":
            continue
        workflows = provider.get("rh_workflows") or []
        kept = [item for item in workflows if runninghub_workflow_store_key(item.get("workflowId") or item.get("id")) != key]
        if len(kept) != len(workflows):
            provider["rh_workflows"] = kept
            changed = True
    if changed:
        save_api_providers([normalize_provider(item) for item in providers])


def runninghub_provider():
    return get_api_provider_exact("runninghub")


def runninghub_api_key(provider=None, use_wallet: bool = False) -> str:
    provider = provider or runninghub_provider()
    free_key = str((provider or {}).get("api_key") or "").strip() or provider_env_key_value(provider["id"])
    wallet_key = os.getenv(runninghub_wallet_key_env(), "")
    api_key = wallet_key if use_wallet and wallet_key else free_key
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 RunningHub API Key，请在 RH 设置中填写。")
    return api_key



def runninghub_openapi_base_url(provider=None):
    base_url = str((provider or {}).get("base_url") or RUNNINGHUB_DEFAULT_BASE_URL).strip().rstrip("/")
    if base_url.endswith("/openapi/v2"):
        return base_url
    return f"{base_url}/openapi/v2"


def runninghub_openapi_url(provider, path: str = "") -> str:
    path = str(path or "").strip()
    if path.startswith("http://") or path.startswith("https://"):
        return path
    path = path.lstrip("/")
    base = runninghub_openapi_base_url(provider)
    return f"{base}/{path}" if path else base

def runninghub_endpoint_url(provider, path: str) -> str:
    base_url = str((provider or {}).get("base_url") or RUNNINGHUB_DEFAULT_BASE_URL).strip().rstrip("/")
    return f"{base_url}{path}"


def runninghub_app_headers(json_body: bool = True, use_wallet: bool = False) -> dict:
    headers = {"Host": "www.runninghub.cn"}
    provider = runninghub_provider()
    free_key = os.getenv(provider_key_env(provider["id"]), "")
    wallet_key = os.getenv(runninghub_wallet_key_env(), "")
    api_key = wallet_key if use_wallet and wallet_key else free_key
    if api_key:
        headers["Authorization"] = bearer_auth_value(api_key)
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def runninghub_local_asset_path(url: str):
    text = str(url or "").strip()
    if text.startswith("/assets/input/") or text.startswith("/input/"):
        clean = urllib.parse.unquote(text.split("?", 1)[0]).replace("\\", "/")
        rel = clean[len("/assets/input/"):] if clean.startswith("/assets/input/") else clean[len("/input/"):]
        root = str(OUTPUT_INPUT_DIR)
    elif text.startswith("/assets/output/"):
        clean = urllib.parse.unquote(text.split("?", 1)[0]).replace("\\", "/")
        rel = clean[len("/assets/output/"):]
        root = str(OUTPUT_OUTPUT_DIR)
    elif text.startswith("/output/") or text.startswith("/assets/"):
        return output_file_from_url(text)
    else:
        return None
    rel = rel.lstrip("/")
    if not rel:
        return None
    path = os.path.abspath(os.path.join(root, rel))
    root_abs = os.path.abspath(root)
    if os.path.commonpath([root_abs, path]) != root_abs or not os.path.exists(path):
        return None
    return path


def runninghub_extract_outputs(data):
    arr = []
    if isinstance(data, list):
        arr = data
    elif isinstance(data, dict):
        for key in ("outputs", "results", "files", "data"):
            value = data.get(key)
            if isinstance(value, list):
                arr = value
                break
    outputs = []
    for item in arr:
        if isinstance(item, str):
            outputs.append(rewrite_runninghub_file_url(item))
        elif isinstance(item, dict):
            url = item.get("fileUrl") or item.get("url") or item.get("downloadUrl")
            if url:
                outputs.append(rewrite_runninghub_file_url(url))
    return outputs


def runninghub_fail_reason(raw) -> str:
    if not isinstance(raw, dict):
        return ""
    for value in [raw.get("msg"), raw.get("message"), raw.get("error")]:
        if value:
            return str(value)
    return ""


def image_output_meta(url: str) -> dict:
    return {"url": url, "kind": "image"}


async def runninghub_store_remote_output(client, remote: str) -> str:
    remote = rewrite_runninghub_file_url(remote)
    if not str(remote or "").startswith(("http://", "https://")):
        return remote
    response = await client.get(remote, follow_redirects=True)
    if not response.is_success:
        return remote
    ext = os.path.splitext(str(remote).split("?", 1)[0])[1].lower().strip(".") or "png"
    filename = f"rh_{uuid.uuid4().hex[:12]}.{ext}"
    path = output_path_for(filename, "output")
    with open(path, "wb") as f:
        f.write(response.content)
    return output_url_for(filename, "output")


def runninghub_infer_workflow_field_type(field_name, field_value) -> str:
    key = f"{field_name or ''} {field_value or ''}".lower()
    if re.search(r"\b(image|img|mask)\b", key):
        return "IMAGE"
    if re.search(r"\b(video|mp4)\b", key):
        return "VIDEO"
    return "TEXT"


def runninghub_collect_workflow_fields(workflow_json) -> list[dict]:
    fields = []
    if not isinstance(workflow_json, dict):
        return fields
    for node_id, node_content in workflow_json.items():
        if not isinstance(node_content, dict):
            continue
        inputs = node_content.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for field_name, raw_value in inputs.items():
            if runninghub_is_workflow_link_value(raw_value):
                continue
            field_value = json.dumps(raw_value, ensure_ascii=False) if isinstance(raw_value, (dict, list)) else str(raw_value or "")
            fields.append({
                "id": f"{node_id}::{field_name}",
                "nodeId": str(node_id),
                "fieldName": str(field_name),
                "fieldValue": field_value,
                "fieldType": runninghub_infer_workflow_field_type(field_name, field_value),
                "label": str(field_name),
                "enabled": False,
                "sourceFromUpstream": True,
                "group": str(node_content.get("class_type") or ""),
                "note": "",
                "imageOrder": 0,
                "required": False,
            })
    return fields


def runninghub_workflow_node_info_list(workflow_json) -> list[dict]:
    result = []
    if not isinstance(workflow_json, dict):
        return result
    for node_id, node_content in workflow_json.items():
        inputs = node_content.get("inputs") if isinstance(node_content, dict) else None
        if not isinstance(inputs, dict):
            continue
        for field_name, raw_value in inputs.items():
            if runninghub_is_workflow_link_value(raw_value):
                continue
            field_value = json.dumps(raw_value, ensure_ascii=False) if isinstance(raw_value, (dict, list)) else str(raw_value or "")
            result.append({"nodeId": str(node_id), "fieldName": str(field_name), "fieldValue": field_value})
    return result


def sanitize_runninghub_node_info_list(items) -> list[dict]:
    return [dict(item) for item in (items or []) if isinstance(item, dict)]
