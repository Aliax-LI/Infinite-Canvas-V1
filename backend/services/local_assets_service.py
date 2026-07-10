import json
import os
import re
import urllib.parse
import uuid

from PIL import Image
from fastapi import HTTPException

from backend.config import LOCAL_UPLOAD_DIR
from backend.services.media_paths import local_upload_kind_ext, sanitize_asset_name


def local_upload_rel_path(value: str) -> str:
    text = str(value or "").replace("\\", "/").strip().lstrip("/")
    if not text:
        return ""
    norm = os.path.normpath(text).replace("\\", "/")
    if norm in {".", ""}:
        return ""
    if norm.startswith("../") or norm == ".." or os.path.isabs(norm):
        raise HTTPException(status_code=400, detail="非法路径")
    return norm


def local_upload_abs(rel: str) -> tuple[str, str]:
    rel_path = local_upload_rel_path(rel)
    path = os.path.abspath(os.path.join(str(LOCAL_UPLOAD_DIR), rel_path))
    root = os.path.abspath(str(LOCAL_UPLOAD_DIR))
    try:
        common = os.path.commonpath([root, path])
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    if common != root:
        raise HTTPException(status_code=400, detail="非法路径")
    return rel_path, path


def local_upload_safe_path(name: str) -> tuple[str, str]:
    filename, path = local_upload_abs(name)
    if not filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    return filename, path


def local_upload_safe_folder(path_value: str) -> tuple[str, str]:
    return local_upload_abs(path_value)


def local_upload_safe_folder_name(name: str) -> str:
    cleaned = sanitize_asset_name(os.path.basename(str(name or "").strip()), "")
    cleaned = re.sub(r"[\\/]+", "_", cleaned).strip(" ._")
    if not cleaned:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")
    return cleaned[:60]


def local_upload_safe_file_stem(name: str) -> str:
    raw = os.path.splitext(os.path.basename(str(name or "").strip()))[0]
    cleaned = sanitize_asset_name(raw, "")
    cleaned = re.sub(r"[\\/]+", "_", cleaned).strip(" ._")
    if not cleaned:
        raise HTTPException(status_code=400, detail="文件名称不能为空")
    return cleaned[:120]


def local_upload_caption_path(filename: str) -> str:
    return os.path.splitext(os.path.join(str(LOCAL_UPLOAD_DIR), filename))[0] + ".txt"


def local_upload_classification_path(filename: str) -> str:
    return os.path.splitext(os.path.join(str(LOCAL_UPLOAD_DIR), filename))[0] + ".classification.json"


def local_upload_display_name(filename: str) -> str:
    base = os.path.basename(str(filename or ""))
    match = re.match(r"^up_[0-9a-f]{12}_(.+)$", base)
    return match.group(1) if match else base


def read_local_upload_caption(filename: str) -> tuple[str, str]:
    caption_path = local_upload_caption_path(filename)
    if not os.path.isfile(caption_path):
        return "", ""
    try:
        with open(caption_path, encoding="utf-8-sig") as f:
            text = f.read()
    except UnicodeDecodeError:
        with open(caption_path, encoding="gb18030", errors="replace") as f:
            text = f.read()
    except OSError:
        return "", ""
    return text, os.path.basename(caption_path)


def read_local_upload_classification(filename: str) -> dict | None:
    path = local_upload_classification_path(filename)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return None


def local_upload_item(filename: str) -> dict:
    path = os.path.join(str(LOCAL_UPLOAD_DIR), filename)
    rel = local_upload_rel_path(filename)
    try:
        stat = os.stat(path)
        size = stat.st_size
        created_at = stat.st_mtime
    except OSError:
        size = 0
        created_at = 0
    kind, _ = local_upload_kind_ext(filename, "")
    item = {
        "id": rel,
        "file": rel,
        "name": local_upload_display_name(rel),
        "url": f"/assets/uploads/{urllib.parse.quote(rel, safe='/')}",
        "kind": kind or "image",
        "size": size,
        "created_at": created_at,
        "folder": os.path.dirname(rel).replace("\\", "/"),
    }
    if kind == "image":
        try:
            with Image.open(path) as img:
                item["natural_w"], item["natural_h"] = img.size
                item["width"], item["height"] = img.size
        except OSError:
            pass
        caption, caption_file = read_local_upload_caption(filename)
        item["caption"] = caption
        item["caption_file"] = caption_file
        classification = read_local_upload_classification(filename)
        if classification:
            item["classification"] = classification
    return item


def local_upload_folder_node(path: str = "", name: str = "全部上传") -> dict:
    rel = local_upload_rel_path(path)
    return {
        "id": rel or "__root__",
        "path": rel,
        "name": name if not rel else os.path.basename(rel),
        "items": [],
        "children": [],
    }


def local_upload_tree_and_items() -> tuple[dict, list]:
    os.makedirs(str(LOCAL_UPLOAD_DIR), exist_ok=True)
    root_node = local_upload_folder_node("", "全部上传")
    folder_map = {"": root_node}
    items: list[dict] = []
    for current, dirs, files in os.walk(str(LOCAL_UPLOAD_DIR)):
        dirs[:] = sorted([d for d in dirs if not d.startswith(".") and not d.startswith("._")], key=str.lower)
        rel_dir = os.path.relpath(current, str(LOCAL_UPLOAD_DIR)).replace("\\", "/")
        if rel_dir == ".":
            rel_dir = ""
        node = folder_map.get(rel_dir)
        if node is None:
            node = local_upload_folder_node(rel_dir)
            folder_map[rel_dir] = node
        for dirname in dirs:
            child_rel = f"{rel_dir}/{dirname}".lstrip("/")
            child = local_upload_folder_node(child_rel)
            folder_map[child_rel] = child
            node["children"].append(child)
        for name in sorted(files, key=str.lower):
            if name.startswith(".") or name.startswith("._"):
                continue
            rel_file = f"{rel_dir}/{name}".lstrip("/")
            kind, _ = local_upload_kind_ext(name, "")
            if kind is None:
                continue
            item = local_upload_item(rel_file)
            node["items"].append(item)
            items.append(item)

    def fill_counts(node: dict) -> int:
        total = len(node.get("items") or [])
        for child in node.get("children") or []:
            total += fill_counts(child)
        node["count"] = total
        return total

    fill_counts(root_node)
    items.sort(key=lambda it: it.get("created_at") or 0, reverse=True)
    return root_node, items


def sniff_image_ext_bytes(head: bytes) -> str | None:
    head = head or b""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WEBP":
        return ".webp"
    return None


async def save_upload_file(content: bytes, filename: str, content_type: str, folder: str = "") -> dict:
    folder_rel, folder_abs = local_upload_safe_folder(folder)
    os.makedirs(folder_abs, exist_ok=True)
    kind, ext = local_upload_kind_ext(filename, content_type)
    if kind is None:
        raise HTTPException(status_code=400, detail="不支持的素材类型")
    base = os.path.splitext(os.path.basename(filename or "file"))[0]
    base = re.sub(r"[^0-9A-Za-z一-鿿._-]+", "_", base).strip("_") or "file"
    base = base[:60]
    out_name = f"up_{uuid.uuid4().hex[:12]}_{base}{ext}"
    rel_name = f"{folder_rel}/{out_name}".lstrip("/")
    path = os.path.join(folder_abs, out_name)
    with open(path, "wb") as f:
        f.write(content)
    return local_upload_item(rel_name)


import shutil
import urllib.request

from backend.config import LOCAL_IMAGE_IMPORT_EXTS, LOCAL_IMAGE_IMPORT_MAX_BYTES
from backend.services.media_paths import output_path_for, output_url_for


def normalize_local_image_path(value: str) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    if not text:
        raise HTTPException(status_code=400, detail="本地图片路径为空")
    if text.lower().startswith("file:"):
        parsed = urllib.parse.urlparse(text)
        if parsed.scheme.lower() != "file":
            raise HTTPException(status_code=400, detail="只支持本地图片路径")
        if parsed.netloc and re.match(r"^[a-zA-Z]:$", parsed.netloc) and os.name == "nt":
            path = f"{parsed.netloc}{urllib.request.url2pathname(parsed.path or '')}"
        elif parsed.netloc and parsed.netloc.lower() not in ("localhost",):
            raise HTTPException(status_code=400, detail="只支持本机图片路径")
        else:
            path = urllib.request.url2pathname(parsed.path or "")
    else:
        path = text
    path = path.strip().strip('"').strip("'")
    if re.match(r"^/[a-zA-Z]:[\\/]", path):
        path = path[1:]
    if re.match(r"^[a-zA-Z]:[\\/]", path):
        return os.path.abspath(path)
    if path.startswith("/") and os.name != "nt":
        return os.path.abspath(path)
    raise HTTPException(status_code=400, detail="只支持本机绝对图片路径")


def import_local_image_file(path: str) -> dict:
    ext = os.path.splitext(path)[1].lower()
    if ext not in LOCAL_IMAGE_IMPORT_EXTS:
        raise HTTPException(status_code=400, detail="仅支持 PNG、JPG、JPEG、WEBP、GIF 图片")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="本地图片不存在或无法读取")
    try:
        size = os.path.getsize(path)
    except OSError:
        raise HTTPException(status_code=404, detail="本地图片不存在或无法读取")
    if size <= 0:
        raise HTTPException(status_code=400, detail="本地图片为空")
    if size > LOCAL_IMAGE_IMPORT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="本地图片过大，请使用 50MB 以内的图片")
    try:
        with Image.open(path) as img:
            img.verify()
    except OSError:
        raise HTTPException(status_code=400, detail="文件不是可识别的图片")
    filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
    dest = output_path_for(filename, "input")
    try:
        shutil.copyfile(path, dest)
    except OSError:
        raise HTTPException(status_code=500, detail="导入本地图片失败")
    return {"url": output_url_for(filename, "input"), "name": os.path.basename(path) or filename, "kind": "image"}
