"""Bridge legacy /assets URLs with ObjectStore keys."""

from __future__ import annotations

import os
import urllib.parse
from pathlib import Path

from backend.storage.local_object_store import LocalObjectStore
from backend.storage.object_store import StoredObject
from backend.storage.object_store_factory import get_object_store


def asset_url_for_key(object_key: str) -> str:
    key = str(object_key or "").replace("\\", "/").strip("/")
    return f"/assets/{urllib.parse.quote(key, safe='/')}"


def object_key_from_asset_url(url: str | dict | None) -> str | None:
    if isinstance(url, dict):
        url = url.get("url", "")
    text = str(url or "").strip()
    if not text.startswith("/assets/"):
        return None
    clean = urllib.parse.unquote(text.split("?", 1)[0]).replace("\\", "/")
    rel = clean[len("/assets/") :].lstrip("/")
    return rel or None


def object_filesystem_path(object_key: str) -> str | None:
    store = get_object_store()
    if not store.exists(object_key):
        return None
    if isinstance(store, LocalObjectStore):
        return str(store.filesystem_path(object_key))
    return None


def resolve_asset_filesystem_path(url: str | dict | None) -> str | None:
    key = object_key_from_asset_url(url)
    if key:
        path = object_filesystem_path(key)
        if path and os.path.isfile(path):
            return path
    return None


def put_asset_bytes(
    content: bytes,
    *,
    category: str,
    filename: str,
    content_type: str,
    metadata: dict | None = None,
) -> StoredObject:
    name = str(filename or "").replace("\\", "/").lstrip("/")
    cat = category.strip("/")
    key = name if name.startswith(f"{cat}/") else f"{cat}/{name}"
    store = get_object_store()
    meta = dict(metadata or {})
    meta.setdefault("original_filename", os.path.basename(name))
    stored = store.put(
        content,
        content_type=content_type,
        metadata=meta,
        object_key=key,
    )
    return StoredObject(
        object_key=stored.object_key,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        url=asset_url_for_key(stored.object_key),
        sha256=stored.sha256,
        original_filename=stored.original_filename,
        metadata=stored.metadata,
    )


def put_asset_file(
    source_path: str,
    *,
    category: str,
    filename: str,
    content_type: str,
    metadata: dict | None = None,
) -> StoredObject:
    name = str(filename or "").replace("\\", "/").lstrip("/")
    cat = category.strip("/")
    key = name if name.startswith(f"{cat}/") else f"{cat}/{name}"
    store = get_object_store()
    meta = dict(metadata or {})
    meta.setdefault("original_filename", os.path.basename(name))
    stored = store.put(
        source_path,
        content_type=content_type,
        metadata=meta,
        object_key=key,
    )
    return StoredObject(
        object_key=stored.object_key,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        url=asset_url_for_key(stored.object_key),
        sha256=stored.sha256,
        original_filename=stored.original_filename,
        metadata=stored.metadata,
    )


def uploads_root() -> Path:
    store = get_object_store()
    if isinstance(store, LocalObjectStore):
        root = store.root / "uploads"
        root.mkdir(parents=True, exist_ok=True)
        return root
    return Path()


def sidecar_object_key(filename: str, suffix: str) -> str:
    base = os.path.splitext(str(filename or ""))[0].replace("\\", "/")
    return f"uploads/{base}{suffix}"
