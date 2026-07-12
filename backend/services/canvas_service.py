import hashlib
import uuid
from typing import Any

from fastapi import HTTPException

from backend.config import (
    CANVAS_COLORS,
    CANVAS_TRASH_RETENTION_MS,
    DEFAULT_PROJECT_ID,
)
from backend.repositories import get_canvas_repository
from backend.repositories.json.canvas_repository import canvas_file_path
from backend.services.common import now_ms


def canvas_path(canvas_id: str) -> str:
    return canvas_file_path(canvas_id)


def normalize_canvas_kind(kind: str = "classic") -> str:
    return "smart" if str(kind or "").strip().lower() == "smart" else "classic"


def normalize_canvas_color(value: Any) -> str:
    color = str(value or "").strip().lower()
    return color if color in CANVAS_COLORS else ""


def canvas_record(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": data.get("id"),
        "title": data.get("title", "未命名画布"),
        "icon": data.get("icon", "🧩"),
        "kind": normalize_canvas_kind(data.get("kind")),
        "owner": str(data.get("owner") or "")[:40],
        "color": normalize_canvas_color(data.get("color")),
        "pinned": bool(data.get("pinned") or False),
        "project": str(data.get("project") or "").strip() or DEFAULT_PROJECT_ID,
        "board_x": data.get("board_x"),
        "board_y": data.get("board_y"),
        "created_at": data.get("created_at", 0),
        "updated_at": data.get("updated_at", 0),
        "deleted_at": data.get("deleted_at", 0),
        "node_count": len(data.get("nodes", [])),
    }


def _repo():
    return get_canvas_repository()


def save_canvas(canvas: dict[str, Any]) -> None:
    _repo().save(canvas)


def new_canvas(
    title: str = "未命名画布",
    icon: str = "layers",
    kind: str = "classic",
    project: str | None = None,
    board_x: float | None = None,
    board_y: float | None = None,
) -> dict[str, Any]:
    from backend.services.project_service import ensure_default_project

    ensure_default_project()
    timestamp = now_ms()
    canvas_kind = normalize_canvas_kind(kind)
    canvas = {
        "id": uuid.uuid4().hex,
        "title": (title or ("智能画布" if canvas_kind == "smart" else "未命名画布"))[:80],
        "icon": (icon or ("sparkles" if canvas_kind == "smart" else "🧩"))[:32],
        "kind": canvas_kind,
        "owner": "",
        "color": "",
        "pinned": False,
        "project": str(project or "").strip() or DEFAULT_PROJECT_ID,
        "created_at": timestamp,
        "updated_at": timestamp,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
    }
    if board_x is not None:
        canvas["board_x"] = float(board_x)
    if board_y is not None:
        canvas["board_y"] = float(board_y)
    save_canvas(canvas)
    return canvas


def load_canvas(canvas_id: str) -> dict[str, Any]:
    canvas = _repo().load_any(canvas_id)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas


def load_canvas_any(canvas_id: str) -> dict[str, Any]:
    return _repo().load_any(canvas_id)


def cleanup_expired_canvas_trash() -> None:
    _repo().cleanup_expired_trash(CANVAS_TRASH_RETENTION_MS)


def iter_canvas_records(include_deleted: bool = False) -> list[dict[str, Any]]:
    cleanup_expired_canvas_trash()
    return [canvas_record(data) for data in _repo().list_documents(include_deleted=include_deleted)]


def list_canvases() -> list[dict[str, Any]]:
    records = iter_canvas_records(include_deleted=False)
    return sorted(
        records,
        key=lambda item: (
            0 if item.get("pinned") else 1,
            -int(item.get("updated_at") or item.get("created_at") or 0),
        ),
    )


def list_deleted_canvases() -> list[dict[str, Any]]:
    records = iter_canvas_records(include_deleted=True)
    return sorted(records, key=lambda item: item["deleted_at"], reverse=True)


def update_canvas_meta(canvas_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    canvas = load_canvas(canvas_id)
    if payload.get("title") is not None:
        canvas["title"] = (payload["title"] or canvas.get("title") or "未命名画布")[:80]
    if payload.get("icon") is not None:
        canvas["icon"] = (payload["icon"] or "layers")[:32]
    if payload.get("owner") is not None:
        canvas["owner"] = str(payload["owner"]).strip()[:40]
    if payload.get("color") is not None:
        canvas["color"] = normalize_canvas_color(payload["color"])
    if payload.get("pinned") is not None:
        canvas["pinned"] = bool(payload["pinned"])
    if payload.get("project") is not None:
        canvas["project"] = str(payload["project"]).strip() or DEFAULT_PROJECT_ID
    if payload.get("board_x") is not None:
        canvas["board_x"] = float(payload["board_x"])
    if payload.get("board_y") is not None:
        canvas["board_y"] = float(payload["board_y"])
    _repo().save(canvas, touch_updated_at=False)
    return canvas_record(canvas)


def update_canvas(canvas_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    canvas = load_canvas(canvas_id)
    current_updated_at = int(canvas.get("updated_at") or 0)
    base_updated_at = int(payload.get("base_updated_at") or 0)
    if base_updated_at and current_updated_at and base_updated_at < current_updated_at:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "画布已被其他页面更新，已拒绝旧版本覆盖。",
                "canvas": canvas,
                "updated_at": current_updated_at,
            },
        )
    canvas["title"] = (payload.get("title") or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.get("icon") or canvas.get("icon") or "layers")[:32]
    canvas["kind"] = normalize_canvas_kind(canvas.get("kind"))
    canvas["nodes"] = payload.get("nodes") or []
    canvas["connections"] = payload.get("connections") or []
    if payload.get("viewport") is not None:
        canvas["viewport"] = payload.get("viewport") or {}
    else:
        canvas["viewport"] = canvas.get("viewport") or {"x": 0, "y": 0, "scale": 1}
    logs = payload.get("logs") or []
    canvas["logs"] = logs[-500:]
    canvas["settings"] = payload.get("settings") or {}
    save_canvas(canvas)
    return canvas


def delete_canvas(canvas_id: str) -> None:
    canvas = load_canvas_any(canvas_id)
    if not canvas.get("deleted_at"):
        canvas["deleted_at"] = now_ms()
        save_canvas(canvas)


def restore_canvas(canvas_id: str) -> dict[str, Any]:
    canvas = load_canvas_any(canvas_id)
    if canvas.get("deleted_at"):
        canvas.pop("deleted_at", None)
        save_canvas(canvas)
    return canvas


def purge_canvas(canvas_id: str) -> None:
    _repo().delete_file(canvas_id)


def canvas_asset_url_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("url", "path", "src", "uri", "output", "output_url", "outputUrl", "video", "video_url", "videoUrl"):
            text = str(value.get(key) or "").strip()
            if text:
                return text
    return ""


def canvas_asset_downloadable_url(url: str) -> str:
    text = str(url or "").strip()
    return text if text.startswith(("/output/", "/assets/", "http://", "https://")) else ""


def canvas_asset_kind(value: Any, url: str = "") -> str:
    from backend.services.media_paths import asset_library_media_kind

    explicit = ""
    if isinstance(value, dict):
        explicit = str(value.get("kind") or value.get("mediaKind") or value.get("type") or "").lower()
    if "video" in explicit:
        return "video"
    if "audio" in explicit:
        return "audio"
    if "text" in explicit:
        return "text"
    if "workflow" in explicit:
        return "workflow"
    return asset_library_media_kind(url or canvas_asset_url_value(value))


def canvas_asset_name(value: Any, url: str = "", fallback: str = "asset") -> str:
    from backend.services.media_paths import filename_from_media_url, sanitize_asset_name

    if isinstance(value, dict):
        for key in ("name", "filename", "file", "title"):
            name = str(value.get(key) or "").strip()
            if name:
                return sanitize_asset_name(name, fallback)
    return sanitize_asset_name(filename_from_media_url(url, fallback), fallback)


def iter_canvas_asset_values(value: Any, path: str = ""):
    if isinstance(value, dict):
        url = canvas_asset_downloadable_url(canvas_asset_url_value(value))
        if url:
            yield path, value, url
        for key, child in value.items():
            if key in {"run", "runs", "settings", "params", "metadata", "meta", "prompt", "text", "caption", "logs"}:
                continue
            yield from iter_canvas_asset_values(child, f"{path}.{key}" if path else str(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_canvas_asset_values(child, f"{path}[{index}]")
    elif isinstance(value, str):
        url = canvas_asset_downloadable_url(value)
        if url:
            yield path, value, url


def canvas_node_title(node: dict[str, Any]) -> str:
    if not isinstance(node, dict):
        return ""
    return str(node.get("title") or node.get("name") or node.get("label") or node.get("type") or "节点")[:120]


def extract_canvas_assets(canvas: dict[str, Any]) -> list[dict[str, Any]]:
    record = canvas_record(canvas)
    canvas_id = str(record.get("id") or "")
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    nodes = canvas.get("nodes") if isinstance(canvas.get("nodes"), list) else []
    for node_index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or f"node_{node_index}")
        node_title = canvas_node_title(node)
        for field_path, raw, url in iter_canvas_asset_values(node):
            if url in seen:
                continue
            seen.add(url)
            kind = canvas_asset_kind(raw, url)
            if kind not in {"image", "video", "audio", "text"}:
                continue
            fallback = f"{record.get('title') or 'canvas'}-{len(items) + 1}"
            item = {
                "id": hashlib.sha1(f"{canvas_id}:{url}".encode("utf-8"), usedforsecurity=False).hexdigest()[:24],
                "url": url,
                "name": canvas_asset_name(raw, url, fallback),
                "kind": kind,
                "canvas_id": canvas_id,
                "canvas_title": record.get("title") or "未命名画布",
                "canvas_kind": record.get("kind") or "classic",
                "canvas_icon": record.get("icon") or "layers",
                "canvas_owner": record.get("owner") or "",
                "canvas_color": record.get("color") or "",
                "canvas_created_at": record.get("created_at") or 0,
                "canvas_updated_at": record.get("updated_at") or 0,
                "node_id": node_id,
                "node_title": node_title,
                "node_type": str(node.get("type") or ""),
                "source_path": field_path,
                "created_at": node.get("created_at") or record.get("updated_at") or record.get("created_at") or 0,
            }
            if isinstance(raw, dict):
                for key in ("natural_w", "natural_h", "width", "height", "size", "duration", "runMs"):
                    if raw.get(key) is not None:
                        item[key] = raw.get(key)
            items.append(item)
    return items


def canvas_assets_index() -> dict[str, Any]:
    canvases: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    canvas_counts = {"all": 0, "smart": 0, "classic": 0}
    item_counts = {"all": 0, "smart": 0, "classic": 0}
    cleanup_expired_canvas_trash()
    for canvas in _repo().list_documents(include_deleted=False):
        record = canvas_record(canvas)
        canvas_items = extract_canvas_assets(canvas)
        record["asset_count"] = len(canvas_items)
        canvases.append(record)
        items.extend(canvas_items)
        kind = record.get("kind") or "classic"
        canvas_counts["all"] += 1
        canvas_counts[kind] = canvas_counts.get(kind, 0) + 1
        item_counts["all"] += len(canvas_items)
        item_counts[kind] = item_counts.get(kind, 0) + len(canvas_items)
    canvases.sort(key=lambda item: (0 if item.get("pinned") else 1, -int(item.get("updated_at") or item.get("created_at") or 0)))
    items.sort(key=lambda item: int(item.get("canvas_updated_at") or item.get("created_at") or 0), reverse=True)
    categories = [
        {"id": "all", "name": "全部画布", "count": item_counts.get("all", 0), "canvas_count": canvas_counts.get("all", 0)},
        {"id": "smart", "name": "智能画布", "count": item_counts.get("smart", 0), "canvas_count": canvas_counts.get("smart", 0)},
        {"id": "classic", "name": "普通画布", "count": item_counts.get("classic", 0), "canvas_count": canvas_counts.get("classic", 0)},
    ]
    return {"categories": categories, "canvases": canvases, "items": items}
