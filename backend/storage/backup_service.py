"""Full storage backup and statistics (Phase 6–7)."""

from __future__ import annotations

import json
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any

from backend.config import DATA_DIR, DATABASE_PATH, OBJECTS_DIR
from backend.storage.database import backup_database
from backend.storage.migration_manifest import build_manifest, save_manifest
from backend.storage.orphan_scanner import list_object_keys, scan_orphan_objects


def _dir_size(path: Path) -> int:
    if not path.is_dir():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            total += item.stat().st_size
    return total


def storage_stats(
    *,
    data_dir: Path = DATA_DIR,
    db_path: Path = DATABASE_PATH,
    objects_dir: Path = OBJECTS_DIR,
) -> dict[str, Any]:
    db_size = db_path.stat().st_size if db_path.is_file() else 0
    keys = list_object_keys(objects_dir)
    orphans = scan_orphan_objects(objects_root=objects_dir, data_dir=data_dir)
    return {
        "data_dir": str(data_dir),
        "database_path": str(db_path),
        "database_bytes": db_size,
        "objects_dir": str(objects_dir),
        "object_count": len(keys),
        "objects_bytes": _dir_size(objects_dir),
        "orphan_count": orphans["orphan_count"],
        "orphan_bytes": orphans["orphan_bytes"],
    }


def create_full_backup(
    *,
    data_dir: Path = DATA_DIR,
    db_path: Path = DATABASE_PATH,
    objects_dir: Path = OBJECTS_DIR,
    backup_root: Path | None = None,
) -> dict[str, Any]:
    root = backup_root or (data_dir / "backups")
    root.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    dest = root / f"full_backup_{stamp}"
    dest.mkdir(parents=True, exist_ok=True)

    if db_path.is_file():
        try:
            backup_database(db_path, dest / "infinite-canvas.db")
        except (OSError, ValueError, sqlite3.Error):
            shutil.copy2(db_path, dest / "infinite-canvas.db")

    if objects_dir.is_dir():
        shutil.copytree(objects_dir, dest / "objects", dirs_exist_ok=True)

    manifest = build_manifest(data_dir)
    save_manifest(manifest, dest / "json_manifest.json")

    meta = {
        "created_at_ms": int(time.time() * 1000),
        "data_dir": str(data_dir),
        "database_path": str(db_path),
        "objects_dir": str(objects_dir),
        "stats": storage_stats(data_dir=data_dir, db_path=db_path, objects_dir=objects_dir),
    }
    (dest / "backup_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "backup_dir": str(dest), "meta": meta}


def _backup_root(data_dir: Path) -> Path:
    return data_dir / "backups"


def _is_valid_backup_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    return (path / "infinite-canvas.db").is_file() or (path / "backup_meta.json").is_file()


def resolve_backup_dir(backup_dir: str, *, data_dir: Path = DATA_DIR) -> Path:
    root = _backup_root(data_dir).resolve()
    candidate = Path(str(backup_dir or "")).expanduser().resolve()
    if root not in candidate.parents:
        raise ValueError("backup path outside backups directory")
    if not _is_valid_backup_dir(candidate):
        raise ValueError("invalid backup directory")
    return candidate


def list_backups(*, data_dir: Path = DATA_DIR) -> list[dict[str, Any]]:
    root = _backup_root(data_dir)
    if not root.is_dir():
        return []
    items: list[dict[str, Any]] = []
    for path in sorted(root.iterdir(), reverse=True):
        if not path.is_dir() or not path.name.startswith("full_backup_"):
            continue
        if not _is_valid_backup_dir(path):
            continue
        meta: dict[str, Any] = {}
        meta_path = path / "backup_meta.json"
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError, ValueError, TypeError):
                meta = {}
        items.append(
            {
                "backup_dir": str(path),
                "name": path.name,
                "created_at_ms": int(meta.get("created_at_ms") or 0),
                "meta": meta,
            }
        )
    items.sort(key=lambda item: int(item.get("created_at_ms") or 0), reverse=True)
    return items


def restore_full_backup(
    *,
    backup_dir: Path,
    data_dir: Path = DATA_DIR,
    db_path: Path = DATABASE_PATH,
    objects_dir: Path = OBJECTS_DIR,
) -> dict[str, Any]:
    if not _is_valid_backup_dir(backup_dir):
        raise ValueError("invalid backup directory")

    safety = create_full_backup(
        data_dir=data_dir,
        db_path=db_path,
        objects_dir=objects_dir,
        backup_root=_backup_root(data_dir) / "pre_restore",
    )

    src_db = backup_dir / "infinite-canvas.db"
    if src_db.is_file():
        db_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_db, db_path)

    src_objects = backup_dir / "objects"
    if src_objects.is_dir():
        if objects_dir.is_dir():
            shutil.rmtree(objects_dir)
        shutil.copytree(src_objects, objects_dir)
    else:
        objects_dir.mkdir(parents=True, exist_ok=True)

    return {
        "ok": True,
        "restored_from": str(backup_dir),
        "safety_backup_dir": safety.get("backup_dir", ""),
        "message": "restore complete; restart app recommended",
    }
