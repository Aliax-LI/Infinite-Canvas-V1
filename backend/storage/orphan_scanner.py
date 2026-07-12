"""Scan ObjectStore for unreferenced objects."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from backend.config import CANVAS_DIR, DATA_DIR, OBJECTS_DIR
from backend.services.object_store_media import object_key_from_asset_url

_ASSET_URL_PATTERN = re.compile(r"/assets/[A-Za-z0-9_./\-]+")
_SIDECAR_SUFFIXES = (".txt", ".classification.json")


def list_object_keys(objects_root: Path = OBJECTS_DIR) -> list[str]:
    if not objects_root.is_dir():
        return []
    keys: list[str] = []
    for path in objects_root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(objects_root).as_posix()
        if rel.startswith(".tmp/") or "/.tmp/" in rel:
            continue
        keys.append(rel)
    return sorted(keys)


def extract_asset_urls_from_text(text: str) -> set[str]:
    if not text:
        return set()
    found: set[str] = set()
    for match in _ASSET_URL_PATTERN.finditer(text):
        url = match.group(0).split("?", 1)[0]
        found.add(url)
    return found


def _expand_sidecar_keys(keys: set[str]) -> set[str]:
    expanded = set(keys)
    for key in keys:
        if not key.startswith("uploads/"):
            continue
        if key.endswith(_SIDECAR_SUFFIXES):
            continue
        stem, _ = os.path.splitext(key)
        expanded.add(f"{stem}.txt")
        expanded.add(f"{stem}.classification.json")
    return expanded


def collect_referenced_object_keys(data_dir: Path = DATA_DIR) -> set[str]:
    referenced_urls: set[str] = set()

    try:
        from backend.services.asset_library_service import load_asset_library

        lib = load_asset_library()
        referenced_urls.update(extract_asset_urls_from_text(json.dumps(lib, ensure_ascii=False)))
    except (OSError, TypeError, ValueError):
        pass

    canvas_dir = data_dir / "canvases"
    if canvas_dir.is_dir():
        for path in canvas_dir.glob("*.json"):
            try:
                referenced_urls.update(extract_asset_urls_from_text(path.read_text(encoding="utf-8")))
            except OSError:
                continue

    try:
        from backend.config import DATABASE_PATH, STORAGE_BACKEND

        if STORAGE_BACKEND == "sqlite" and DATABASE_PATH.is_file():
            from backend.storage.database import connect

            conn = connect(DATABASE_PATH, readonly=True)
            try:
                for table, column in (
                    ("canvases", "document_json"),
                    ("conversations", "document_json"),
                    ("asset_library", "document_json"),
                ):
                    try:
                        rows = conn.execute(f"SELECT {column} FROM {table}").fetchall()
                    except Exception:
                        continue
                    for row in rows:
                        referenced_urls.update(extract_asset_urls_from_text(str(row[0] or "")))
            finally:
                conn.close()
    except (OSError, TypeError, ValueError):
        pass

    keys: set[str] = set()
    for url in referenced_urls:
        key = object_key_from_asset_url(url)
        if key:
            keys.add(key)
    return _expand_sidecar_keys(keys)


def scan_orphan_objects(*, objects_root: Path = OBJECTS_DIR, data_dir: Path = DATA_DIR) -> dict[str, Any]:
    all_keys = list_object_keys(objects_root)
    referenced = collect_referenced_object_keys(data_dir)
    orphan_keys = [key for key in all_keys if key not in referenced]
    orphan_bytes = 0
    for key in orphan_keys:
        path = objects_root / key.replace("/", os.sep)
        if path.is_file():
            orphan_bytes += path.stat().st_size
    return {
        "object_count": len(all_keys),
        "referenced_count": len(referenced),
        "orphan_count": len(orphan_keys),
        "orphan_bytes": orphan_bytes,
        "orphan_keys": orphan_keys[:200],
        "truncated": len(orphan_keys) > 200,
    }
