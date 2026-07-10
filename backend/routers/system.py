import os
from typing import Any

from fastapi import APIRouter

from backend.config import GITHUB_REPO_URL
from backend.services import versioning

router = APIRouter(tags=["system"])


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
    return {
        "version": versioning.current_app_version(),
        "desktop_build_id": versioning.current_desktop_build_id(),
        "is_electron": True,
        "repo_url": GITHUB_REPO_URL,
        "release_url": f"{GITHUB_REPO_URL}/releases",
    }


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
