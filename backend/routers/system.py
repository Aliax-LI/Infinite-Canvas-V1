import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.config import GITHUB_REPO_URL
from backend.services import versioning
from backend.storage.health import database_health

router = APIRouter(tags=["system"])


class StorageRestoreRequest(BaseModel):
    backup_dir: str = Field(min_length=1)


def _test_force_update_payload() -> dict[str, Any] | None:
    if os.getenv("INFINITE_CANVAS_TEST") != "1":
        return None
    if os.getenv("INFINITE_CANVAS_TEST_FORCE_UPDATE") != "1":
        return None
    current = versioning.current_app_version()
    return {
        "current": current,
        "latest": {
            "version": "2099.01.1",
            "release_url": f"{GITHUB_REPO_URL}/releases/tag/v2099.01.1",
            "release_notes": "- electron parity test",
        },
        "update_available": True,
        "desktop_build_id": versioning.current_desktop_build_id(),
        "reachable": True,
        "error": "",
    }


@router.get("/api/app-info")
def app_info() -> dict[str, Any]:
    from backend.config import STORAGE_BACKEND

    return {
        "version": versioning.current_app_version(),
        "desktop_build_id": versioning.current_desktop_build_id(),
        "is_electron": True,
        "repo_url": GITHUB_REPO_URL,
        "release_url": f"{GITHUB_REPO_URL}/releases",
        "storage_backend": STORAGE_BACKEND,
    }


@router.get("/api/storage-health")
def storage_health() -> dict[str, Any]:
    from backend.config import DATABASE_PATH, STORAGE_BACKEND

    db = database_health(DATABASE_PATH)
    return {
        "storage_backend": STORAGE_BACKEND,
        "database": db,
        "ok": db.get("ok", False) if STORAGE_BACKEND == "sqlite" else True,
    }


@router.post("/api/storage/migrate")
def migrate_storage() -> dict[str, Any]:
    """One-shot JSON → SQLite migration for legacy installs."""
    from backend.config import DATA_DIR, DATABASE_PATH, STORAGE_BACKEND
    from backend.storage.json_to_sqlite import migrate_json_to_sqlite, migration_complete

    if STORAGE_BACKEND == "sqlite" and migration_complete(DATA_DIR):
        return {"ok": True, "already_migrated": True, "message": "storage already on sqlite"}
    if migration_complete(DATA_DIR):
        return {"ok": True, "already_migrated": True, "message": "migration marker present; restart app to use sqlite"}

    report = migrate_json_to_sqlite(data_dir=DATA_DIR, db_path=DATABASE_PATH)
    payload = report.to_dict()
    payload["ok"] = report.success
    if report.success:
        payload["message"] = "migration complete; restart app to switch to sqlite backend"
    return payload


@router.get("/api/storage/stats")
def storage_stats_endpoint() -> dict[str, Any]:
    from backend.config import DATA_DIR, DATABASE_PATH, OBJECTS_DIR, STORAGE_BACKEND
    from backend.storage.backup_service import storage_stats

    stats = storage_stats(data_dir=DATA_DIR, db_path=DATABASE_PATH, objects_dir=OBJECTS_DIR)
    stats["storage_backend"] = STORAGE_BACKEND
    return stats


@router.get("/api/storage/orphans")
def storage_orphans() -> dict[str, Any]:
    from backend.config import DATA_DIR, OBJECTS_DIR

    from backend.storage.orphan_scanner import scan_orphan_objects

    return scan_orphan_objects(objects_root=OBJECTS_DIR, data_dir=DATA_DIR)


@router.post("/api/storage/backup")
def storage_backup() -> dict[str, Any]:
    from backend.config import DATA_DIR, DATABASE_PATH, OBJECTS_DIR
    from backend.storage.backup_service import create_full_backup

    return create_full_backup(data_dir=DATA_DIR, db_path=DATABASE_PATH, objects_dir=OBJECTS_DIR)


@router.get("/api/storage/backups")
def storage_backups() -> dict[str, Any]:
    from backend.config import DATA_DIR
    from backend.storage.backup_service import list_backups

    return {"backups": list_backups(data_dir=DATA_DIR)}


@router.post("/api/storage/restore")
def storage_restore(payload: StorageRestoreRequest) -> dict[str, Any]:
    from backend.config import DATA_DIR, DATABASE_PATH, OBJECTS_DIR
    from backend.storage.backup_service import resolve_backup_dir, restore_full_backup

    try:
        backup_dir = resolve_backup_dir(payload.backup_dir, data_dir=DATA_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return restore_full_backup(
            backup_dir=backup_dir,
            data_dir=DATA_DIR,
            db_path=DATABASE_PATH,
            objects_dir=OBJECTS_DIR,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"restore failed: {exc}") from exc


@router.get("/api/check-update")
def check_update() -> dict[str, Any]:
    forced = _test_force_update_payload()
    if forced is not None:
        return forced
    current = versioning.current_app_version()
    latest_release = versioning.fetch_github_latest_release()
    latest: dict[str, Any] = {}
    if latest_release.get("ok"):
        latest = {
            "version": latest_release.get("version", ""),
            "release_url": latest_release.get("release_url", f"{GITHUB_REPO_URL}/releases"),
            "release_notes": latest_release.get("release_notes", ""),
        }
    return {
        "current": current,
        "latest": latest,
        "update_available": bool(latest and versioning.version_gt(str(latest.get("version") or ""), current)),
        "desktop_build_id": versioning.current_desktop_build_id(),
        "reachable": bool(latest_release.get("ok")),
        "error": latest_release.get("error", ""),
    }
