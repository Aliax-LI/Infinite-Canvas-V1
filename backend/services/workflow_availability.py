"""ComfyUI workflow availability probing — required nodes and models."""

from __future__ import annotations

import time
from typing import Any

from backend.repositories import get_workflow_repository
from backend.services import comfyui_client
from backend.services.workflow_service import workflow_path_from_name

PROBE_CACHE_TTL_SEC = 60.0
_availability_cache: dict[str, tuple[float, dict]] = {}

MODEL_INPUT_KEYS = frozenset(
    {
        "unet_name",
        "ckpt_name",
        "vae_name",
        "clip_name",
        "lora_name",
        "model_name",
        "model",
        "name",  # ModelPatchLoader (ControlNet Union patch)
        "style_model_name",
        "control_net_name",
        "ipadapter_file",
        "weight_name",
        "adapter_name",
        "embedding_name",
    }
)


def extract_workflow_class_types(workflow: dict[str, Any]) -> list[str]:
    """Extract unique node types from API prompt or UI workflow JSON."""
    seen: set[str] = set()
    ordered: list[str] = []
    nodes = workflow.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            class_type = node.get("type") or node.get("class_type")
            if not isinstance(class_type, str) or not class_type.strip():
                continue
            name = class_type.strip()
            if name not in seen:
                seen.add(name)
                ordered.append(name)
        return ordered
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        class_type = node.get("class_type")
        if not isinstance(class_type, str) or not class_type.strip():
            continue
        name = class_type.strip()
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def extract_workflow_model_refs(workflow: dict[str, Any]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, value in inputs.items():
            if key not in MODEL_INPUT_KEYS:
                continue
            if isinstance(value, str) and value.strip():
                name = value.strip()
                if name not in seen:
                    seen.add(name)
                    ordered.append(name)
    return ordered


def _options_from_input_spec(spec: Any) -> list[str]:
    if not isinstance(spec, list) or not spec:
        return []
    first = spec[0]
    if isinstance(first, list):
        return [str(item) for item in first if isinstance(item, str) and item.strip()]
    return []


def _available_models_for_node(object_info: dict[str, Any], class_type: str) -> set[str]:
    node_info = object_info.get(class_type)
    if not isinstance(node_info, dict):
        return set()
    available: set[str] = set()
    input_block = node_info.get("input")
    if not isinstance(input_block, dict):
        return available
    for section in ("required", "optional"):
        fields = input_block.get(section)
        if not isinstance(fields, dict):
            continue
        for key, spec in fields.items():
            if key in MODEL_INPUT_KEYS:
                available.update(_options_from_input_spec(spec))
    return available


def find_missing_models(
    workflow: dict[str, Any],
    object_info: dict[str, Any],
) -> list[str]:
    missing: list[str] = []
    seen: set[str] = set()
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "").strip()
        if not class_type:
            continue
        available = _available_models_for_node(object_info, class_type)
        if not available:
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, value in inputs.items():
            if key not in MODEL_INPUT_KEYS:
                continue
            if not isinstance(value, str) or not value.strip():
                continue
            model_name = value.strip()
            if model_name in seen:
                continue
            if model_name not in available:
                seen.add(model_name)
                missing.append(model_name)
    return missing


def find_missing_nodes(class_types: list[str], object_info: dict[str, Any]) -> list[str]:
    return [name for name in class_types if name not in object_info]


def load_workflow_dict(name: str) -> dict[str, Any]:
    workflow_path_from_name(name)
    repo = get_workflow_repository()
    if not repo.workflow_exists(name):
        raise FileNotFoundError(name)
    workflow = repo.load_workflow(name)
    if not isinstance(workflow, dict):
        raise ValueError("Invalid workflow JSON")
    return workflow


def check_workflow_availability_dict(
    workflow: dict[str, Any],
    *,
    object_info: dict[str, Any] | None = None,
    comfy_online: bool | None = None,
    reason_prefix: str = "",
) -> dict[str, Any]:
    class_types = extract_workflow_class_types(workflow)
    model_refs = extract_workflow_model_refs(workflow)

    if comfy_online is False:
        return {
            "available": False,
            "missing_nodes": class_types,
            "missing_models": model_refs,
            "reason": f"{reason_prefix}ComfyUI 未在线，无法检测工作流依赖".strip(),
        }

    if object_info is None:
        return {
            "available": False,
            "missing_nodes": class_types,
            "missing_models": model_refs,
            "reason": f"{reason_prefix}无法读取 ComfyUI object_info".strip(),
        }

    missing_nodes = find_missing_nodes(class_types, object_info)
    missing_models = find_missing_models(workflow, object_info)

    if missing_nodes or missing_models:
        parts: list[str] = []
        if missing_nodes:
            parts.append(f"缺少自定义节点: {', '.join(missing_nodes)}")
        if missing_models:
            parts.append(f"缺少模型: {', '.join(missing_models)}")
        return {
            "available": False,
            "missing_nodes": missing_nodes,
            "missing_models": missing_models,
            "reason": f"{reason_prefix}{'; '.join(parts)}".strip(),
        }

    return {
        "available": True,
        "missing_nodes": [],
        "missing_models": [],
    }


def clear_workflow_availability_cache() -> None:
    _availability_cache.clear()
    comfyui_client.clear_upscale_availability_cache()


def check_workflow_availability(name: str, *, force_refresh: bool = False) -> dict[str, Any]:
    now = time.time()
    cached = _availability_cache.get(name)
    if not force_refresh and cached and (now - cached[0]) < PROBE_CACHE_TTL_SEC:
        return dict(cached[1])

    try:
        workflow = load_workflow_dict(name)
    except (FileNotFoundError, ValueError) as exc:
        result = {
            "workflow": name,
            "available": False,
            "missing_nodes": [],
            "missing_models": [],
            "reason": f"工作流不存在或无效: {name}" if isinstance(exc, FileNotFoundError) else str(exc),
        }
        _availability_cache[name] = (now, result)
        return dict(result)

    address = comfyui_client._first_online_comfyui_address()  # noqa: SLF001 — shared probe helper
    if not address:
        result = {
            "workflow": name,
            **check_workflow_availability_dict(workflow, comfy_online=False),
        }
        _availability_cache[name] = (now, result)
        return dict(result)

    object_info = comfyui_client._fetch_object_info(address)  # noqa: SLF001
    result = {
        "workflow": name,
        **check_workflow_availability_dict(workflow, object_info=object_info, comfy_online=True),
    }
    _availability_cache[name] = (now, result)
    return dict(result)


def check_workflows_availability(names: list[str], *, force_refresh: bool = False) -> dict[str, dict]:
    unique: list[str] = []
    seen: set[str] = set()
    for raw in names:
        name = str(raw or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        unique.append(name)
    return {name: check_workflow_availability(name, force_refresh=force_refresh) for name in unique}
