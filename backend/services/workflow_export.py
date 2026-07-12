"""Export ComfyUI workflows in UI (graph) format for missing-node inspection.

Generation uses API prompt format (`{node_id: {class_type, inputs}}`).
ComfyUI Manager / red missing-node stubs need the UI save format
(`{nodes: [{type, ...}], links: [...]}`). Loading an API prompt when custom
nodes are absent often yields an empty graph — users see none of the missing
types. Export therefore converts API → UI while preserving every class_type.
"""

from __future__ import annotations

import copy
import json
import os
from typing import Any

from fastapi import HTTPException

def is_comfy_ui_workflow(data: dict[str, Any]) -> bool:
    return isinstance(data.get("nodes"), list)


def is_comfy_api_prompt(data: dict[str, Any]) -> bool:
    if not data or is_comfy_ui_workflow(data):
        return False
    for value in data.values():
        if isinstance(value, dict) and isinstance(value.get("class_type"), str):
            return True
    return False


def _is_link_ref(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], (str, int))
        and isinstance(value[1], int)
    )


def _assign_int_ids(raw_ids: list[str]) -> dict[str, int]:
    id_map: dict[str, int] = {}
    next_id = 1
    for rid in raw_ids:
        if rid.isdigit():
            nid = int(rid)
            id_map[rid] = nid
            next_id = max(next_id, nid + 1)
    for rid in raw_ids:
        if rid not in id_map:
            id_map[rid] = next_id
            next_id += 1
    return id_map


def api_prompt_to_ui_workflow(api: dict[str, Any]) -> dict[str, Any]:
    """Convert API prompt JSON to a minimal ComfyUI UI workflow graph.

    Every `class_type` becomes a node `type` so ComfyUI can render missing-node
    stubs. Links/widgets are best-effort; the original API prompt is kept under
    `extra.api_prompt` for fidelity.
    """
    if is_comfy_ui_workflow(api):
        return api
    if not is_comfy_api_prompt(api):
        raise ValueError("Not a ComfyUI API prompt or UI workflow")

    raw_ids = [str(k) for k, v in api.items() if isinstance(v, dict) and v.get("class_type")]
    id_map = _assign_int_ids(raw_ids)

    out_slots: dict[str, int] = {rid: 0 for rid in raw_ids}
    pending_links: list[tuple[str, int, str, str]] = []  # src, src_slot, dst, input_name

    for rid in raw_ids:
        inputs = api[rid].get("inputs") if isinstance(api.get(rid), dict) else None
        if not isinstance(inputs, dict):
            continue
        for key, value in inputs.items():
            if not _is_link_ref(value):
                continue
            src = str(value[0])
            src_slot = int(value[1])
            if src in out_slots:
                out_slots[src] = max(out_slots[src], src_slot)
            pending_links.append((src, src_slot, rid, key))

    nodes_by_raw: dict[str, dict[str, Any]] = {}
    for order, rid in enumerate(raw_ids):
        node = api[rid]
        class_type = str(node.get("class_type") or "Unknown")
        title = ""
        meta = node.get("_meta")
        if isinstance(meta, dict) and isinstance(meta.get("title"), str):
            title = meta["title"]
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        nid = id_map[rid]

        widgets_values: list[Any] = []
        for _key, value in inputs.items():
            if not _is_link_ref(value):
                widgets_values.append(value)

        max_out = out_slots.get(rid, 0)
        outputs = [
            {
                "name": f"out_{slot}" if max_out > 0 else "out",
                "type": "*",
                "links": [],
                "slot_index": slot,
            }
            for slot in range(max_out + 1)
        ]

        col, row = order % 8, order // 8
        entry: dict[str, Any] = {
            "id": nid,
            "type": class_type,
            "pos": [40 + col * 280, 40 + row * 160],
            "size": [240, 80],
            "flags": {},
            "order": order,
            "mode": 0,
            "inputs": [],
            "outputs": outputs,
            "properties": {"Node name for S&R": class_type},
            "widgets_values": widgets_values,
        }
        if title:
            entry["title"] = title
        nodes_by_raw[rid] = entry

    links: list[list[Any]] = []
    link_id = 1
    for src_raw, src_slot, dst_raw, input_name in pending_links:
        src_node = nodes_by_raw.get(src_raw)
        dst_node = nodes_by_raw.get(dst_raw)
        if not src_node or not dst_node:
            continue
        input_slot = len(dst_node["inputs"])
        links.append([link_id, src_node["id"], src_slot, dst_node["id"], input_slot, "*"])
        dst_node["inputs"].append({"name": input_name, "type": "*", "link": link_id})
        if 0 <= src_slot < len(src_node["outputs"]):
            out_links = src_node["outputs"][src_slot]["links"]
            if isinstance(out_links, list):
                out_links.append(link_id)
        link_id += 1

    nodes = list(nodes_by_raw.values())
    for node in nodes:
        for out in node["outputs"]:
            if not out["links"]:
                out["links"] = None

    last_node_id = max(id_map.values()) if id_map else 0
    return {
        "last_node_id": last_node_id,
        "last_link_id": max(link_id - 1, 0),
        "nodes": nodes,
        "links": links,
        "groups": [],
        "config": {},
        "extra": {
            "api_prompt": copy.deepcopy(api),
        },
        "version": 0.4,
    }


def extract_export_node_types(workflow: dict[str, Any]) -> list[str]:
    """Unique node types from either UI or API workflow JSON (export order)."""
    seen: set[str] = set()
    ordered: list[str] = []
    if is_comfy_ui_workflow(workflow):
        for node in workflow.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            name = node.get("type") or node.get("class_type")
            if isinstance(name, str) and name.strip() and name not in seen:
                seen.add(name)
                ordered.append(name.strip())
        return ordered
    for value in workflow.values():
        if not isinstance(value, dict):
            continue
        name = value.get("class_type")
        if isinstance(name, str) and name.strip() and name not in seen:
            seen.add(name)
            ordered.append(name.strip())
    return ordered


def load_workflow_for_export(name: str) -> dict[str, Any]:
    """Load the same workflow graph used by Comfy generation (disk first)."""
    from backend.repositories import get_workflow_repository
    from backend.services.workflow_service import workflow_path_from_name

    path = workflow_path_from_name(name)
    # Match comfy_generate: read the on-disk file under WORKFLOW_DIR first.
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data:
            return data
    # Fallback: repository (sqlite custom workflows without a disk twin).
    try:
        repo = get_workflow_repository()
        if repo.workflow_exists(name):
            data = repo.load_workflow(name)
            if isinstance(data, dict) and data:
                return data
    except (OSError, json.JSONDecodeError, ValueError, TypeError, FileNotFoundError):
        pass
    raise HTTPException(status_code=404, detail="Workflow not found")


def build_workflow_export_payload(name: str) -> tuple[dict[str, Any], str]:
    """Return (UI-format workflow dict, download filename)."""
    from backend.services.workflow_service import workflow_path_from_name

    raw = load_workflow_for_export(name)
    if is_comfy_api_prompt(raw):
        exported = api_prompt_to_ui_workflow(raw)
    elif is_comfy_ui_workflow(raw):
        exported = raw
    else:
        raise HTTPException(status_code=400, detail="Invalid workflow JSON")
    filename = os.path.basename(workflow_path_from_name(name))
    return exported, filename
