import json
import os
import re
import uuid

from backend.config import ASSET_LIBRARY_PATH, DATA_DIR, ensure_data_dirs
from backend.services.common import now_ms
from backend.services.media_paths import sanitize_asset_name


GENERATED_CATEGORY_ID = "generated"


def default_asset_library() -> dict:
    categories = [
        {"id": GENERATED_CATEGORY_ID, "name": "生成结果", "type": "image", "items": []},
        {"id": "characters", "name": "角色", "type": "image", "items": []},
        {"id": "scenes", "name": "场景", "type": "image", "items": []},
        {"id": "workflows", "name": "工作流", "type": "workflow", "items": []},
    ]
    return {
        "active_library_id": "default",
        "libraries": [{"id": "default", "name": "默认资产库", "type": "asset", "categories": categories}],
        "categories": categories,
        "updated_at": now_ms(),
    }


def sort_asset_library_items(lib: dict) -> None:
    cats = list(lib.get("categories", []))
    for library in lib.get("libraries", []) if isinstance(lib.get("libraries"), list) else []:
        cats.extend(library.get("categories") or [])
    seen = set()
    for cat in cats:
        if id(cat) in seen:
            continue
        seen.add(id(cat))
        items = cat.get("items")
        if isinstance(items, list):
            items.sort(key=lambda item: int((item or {}).get("created_at") or 0), reverse=True)


def normalize_asset_library(lib: dict) -> dict:
    if not isinstance(lib, dict):
        lib = default_asset_library()
    legacy_categories = lib.get("categories") if isinstance(lib.get("categories"), list) else None
    libraries = lib.get("libraries") if isinstance(lib.get("libraries"), list) else []
    if not libraries:
        libraries = [{
            "id": "default",
            "name": "默认资产库",
            "type": "asset",
            "categories": legacy_categories or default_asset_library()["categories"],
        }]
    for library in libraries:
        library["id"] = re.sub(r"[^A-Za-z0-9_-]+", "_", str(library.get("id") or f"lib_{uuid.uuid4().hex[:8]}"))[:40]
        library["name"] = sanitize_asset_name(library.get("name") or "资产库", "资产库")
        cats = library.get("categories") if isinstance(library.get("categories"), list) else []
        if library.get("id") == "default" and not any(c.get("type") == "workflow" for c in cats):
            cats.append({"id": "workflows", "name": "工作流", "type": "workflow", "items": []})
        if not any(c.get("id") == GENERATED_CATEGORY_ID for c in cats):
            generated = {"id": GENERATED_CATEGORY_ID, "name": "生成结果", "type": "image", "items": []}
            generated["dir"] = unique_asset_category_dir(library, generated["name"])
            os.makedirs(os.path.join(library_storage_dir(), generated["dir"]), exist_ok=True)
            cats.insert(0, generated)
        library["categories"] = cats
    active = str(lib.get("active_library_id") or libraries[0].get("id") or "default")
    if not any(item.get("id") == active for item in libraries):
        active = libraries[0].get("id") or "default"
    active_library = next((item for item in libraries if item.get("id") == active), libraries[0])
    lib["libraries"] = libraries
    lib["active_library_id"] = active
    lib["categories"] = active_library.get("categories") or []
    lib["updated_at"] = int(lib.get("updated_at") or now_ms())
    sort_asset_library_items(lib)
    return lib


def load_asset_library() -> dict:
    from backend.repositories import get_asset_library_repository

    ensure_data_dirs()
    repo = get_asset_library_repository()
    if not ASSET_LIBRARY_PATH.is_file():
        lib = default_asset_library()
        save_asset_library(lib)
        return lib
    try:
        lib = repo.load()
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        lib = default_asset_library()
    return normalize_asset_library(lib)


def save_asset_library(lib: dict) -> dict:
    from backend.repositories import get_asset_library_repository

    lib = normalize_asset_library(lib)
    ensure_data_dirs()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    get_asset_library_repository().save(lib)
    return lib

import os
import shutil
import urllib.parse
import uuid

from fastapi import HTTPException

from backend.config import ASSET_LIBRARY_DIR
from backend.services.media_paths import (
    asset_library_media_kind,
    asset_library_safe_extension,
    library_storage_dir,
    output_file_from_url,
    sanitize_asset_name,
    sanitize_export_filename,
)


def find_asset_library(lib: dict, library_id: str = "") -> dict | None:
    lib = normalize_asset_library(lib)
    library_id = str(library_id or lib.get("active_library_id") or "").strip()
    return next((item for item in lib.get("libraries", []) if item.get("id") == library_id), None) or (lib.get("libraries") or [None])[0]


def find_asset_category_in_library(lib: dict, category_id: str, library_id: str = "") -> dict | None:
    library = find_asset_library(lib, library_id)
    if not library:
        return None
    for cat in library.get("categories", []):
        if cat.get("id") == category_id:
            return cat
    return None


def find_asset_category_with_library(lib: dict, category_id: str, library_id: str = ""):
    lib = normalize_asset_library(lib)
    preferred = str(library_id or "").strip()
    libraries = lib.get("libraries", []) or []
    if preferred:
        libraries = [item for item in libraries if item.get("id") == preferred]
    for library in libraries:
        for cat in library.get("categories", []) or []:
            if cat.get("id") == category_id:
                return library, cat
    return None, None


def find_asset_item_in_library(lib: dict, item_id: str, library_id: str = "") -> dict | None:
    for library in lib.get("libraries", []):
        if library_id and library.get("id") != library_id:
            continue
        for cat in library.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    return item
    return None


def unique_asset_category_dir(library: dict, base_name: str) -> str:
    base = sanitize_asset_name(base_name, "分组").strip(" .") or "分组"
    existing = {
        str(c.get("dir")) for c in (library.get("categories") or [])
        if isinstance(c, dict) and c.get("dir")
    }
    candidate = base
    i = 2
    while candidate in existing or os.path.exists(os.path.join(library_storage_dir(), candidate)):
        candidate = f"{base}_{i}"
        i += 1
    return candidate


def remove_asset_library_file(item) -> None:
    try:
        url = item.get("url") if isinstance(item, dict) else ""
        path = output_file_from_url(url)
        if path and os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


def normalize_item_tags(tags) -> list[str]:
    import re as _re

    clean, seen = [], set()
    values = tags if isinstance(tags, list) else _re.split(r"[,，、/|;；\n]+", str(tags or ""))
    for value in values:
        text = _re.sub(r"\s+", " ", str(value or "").strip())
        text = _re.sub(r"^[#＃]+", "", text).strip(" ,，、;；|/")
        if not text or text in seen:
            continue
        seen.add(text)
        clean.append(text[:24])
        if len(clean) >= 30:
            break
    return clean


def set_item_tags(item: dict, tags: list[str]) -> dict:
    item["tags"] = normalize_item_tags(tags)
    classification = item.get("classification")
    if isinstance(classification, dict):
        classification["tags"] = list(item["tags"])
        classification["updated_at"] = now_ms()
    return item


def apply_classification_to_item(item: dict, classification: dict) -> dict:
    item["classification"] = classification
    summary = str(classification.get("summary") or "").strip()
    if summary:
        item["caption"] = summary[:240]
    tags = classification.get("tags")
    if isinstance(tags, list) and tags:
        item["tags"] = normalize_item_tags(tags)
    return item


def make_asset_library_item(src: str, name: str = "", subdir: str = "") -> tuple[str, dict]:
    kind = asset_library_media_kind(src)
    ext = asset_library_safe_extension(src, kind)
    safe_name = sanitize_asset_name(name or os.path.basename(src), "asset")
    if not os.path.splitext(safe_name)[1]:
        safe_name += ext
    dest_name = f"lib_{uuid.uuid4().hex[:12]}_{safe_name}"
    subdir = str(subdir or "").strip("/").strip()
    if subdir:
        dest_dir = os.path.join(library_storage_dir(), subdir)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, dest_name)
        rel = f"{subdir}/{dest_name}"
    else:
        dest_path = os.path.join(library_storage_dir(), dest_name)
        rel = dest_name
    shutil.copy2(src, dest_path)
    item = {
        "id": f"asset_{uuid.uuid4().hex[:12]}",
        "name": os.path.splitext(safe_name)[0][:120],
        "url": "/assets/library/" + urllib.parse.quote(rel, safe="/"),
        "kind": kind,
        "created_at": now_ms(),
    }
    return dest_name, item


def asset_library_workflow_category(lib: dict, library_id: str = "", category_id: str = ""):
    library = find_asset_library(lib, library_id)
    if not library:
        raise HTTPException(status_code=404, detail="资产库不存在")
    categories = library.setdefault("categories", [])
    cat = None
    if category_id:
        cat = next((c for c in categories if c.get("id") == category_id), None)
        if not cat:
            raise HTTPException(status_code=404, detail="工作流分类不存在")
        if cat.get("type") != "workflow":
            raise HTTPException(status_code=400, detail="目标分组不是工作流分类")
    if not cat:
        cat = next((c for c in categories if c.get("type") == "workflow"), None)
    if not cat:
        cat = {"id": f"wf_{uuid.uuid4().hex[:12]}", "name": "工作流", "type": "workflow", "items": []}
        categories.append(cat)
    lib["active_library_id"] = library.get("id") or lib.get("active_library_id")
    return library, cat


def make_workflow_library_item_from_bytes(raw: bytes, filename: str, name: str = "") -> dict:
    if not raw:
        raise HTTPException(status_code=400, detail="工作流文件为空")
    safe_filename = sanitize_export_filename(filename or "canvas-workflow.zip", "canvas-workflow.zip")
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in {".json", ".zip"}:
        safe_filename += ".zip"
        ext = ".zip"
    dest_name = f"workflow_{uuid.uuid4().hex[:12]}_{safe_filename}"
    dest_path = os.path.join(library_storage_dir(), dest_name)
    os.makedirs(library_storage_dir(), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(raw)
    display_name = sanitize_asset_name(name or os.path.splitext(safe_filename)[0], "工作流")
    return {
        "id": f"wf_{uuid.uuid4().hex[:12]}",
        "name": display_name[:120],
        "url": f"/assets/library/{dest_name}",
        "kind": "workflow",
        "type": "workflow",
        "format": "zip" if ext == ".zip" else "json",
        "size": len(raw),
        "created_at": now_ms(),
    }


def batch_crop_library_items(
    lib: dict,
    *,
    ids: set[str],
    library_id: str = "",
    target_category_id: str = "",
    target_library_id: str = "",
) -> tuple[dict, list[dict]]:
    import tempfile

    from PIL import Image

    from backend.services.media_paths import output_file_from_url

    target_cat = None
    if target_category_id:
        target_cat = find_asset_category_in_library(lib, target_category_id, target_library_id)
        if not target_cat:
            raise HTTPException(status_code=404, detail="目标分组不存在")
        if target_cat.get("type") != "image":
            raise HTTPException(status_code=400, detail="目标分组不支持媒体")
    added: list[dict] = []
    for library in lib.get("libraries", []):
        if library_id and library.get("id") != library_id:
            continue
        for cat in library.get("categories", []):
            if cat.get("type") != "image":
                continue
            source_items = [item for item in (cat.get("items") or []) if item.get("id") in ids]
            for item in source_items:
                src = output_file_from_url(item.get("url") or "")
                if not src or not os.path.isfile(src):
                    continue
                try:
                    with Image.open(src) as img:
                        img = img.convert("RGBA")
                        w, h = img.size
                        side = min(w, h)
                        if side <= 0:
                            continue
                        left = max(0, (w - side) // 2)
                        top = max(0, (h - side) // 2)
                        cropped = img.crop((left, top, left + side, top + side))
                        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                        tmp_path = tmp.name
                        tmp.close()
                        try:
                            cropped.save(tmp_path, "PNG")
                            base_name = os.path.splitext(item.get("name") or "asset")[0] + "_crop.png"
                            dest_cat = target_cat or cat
                            _, next_item = make_asset_library_item(tmp_path, base_name, subdir=dest_cat.get("dir") or "")
                            dest_cat.setdefault("items", []).append(next_item)
                            added.append(next_item)
                        finally:
                            try:
                                os.remove(tmp_path)
                            except OSError:
                                pass
                except OSError:
                    continue
    return lib, added
