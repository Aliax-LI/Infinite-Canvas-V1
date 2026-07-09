from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
VERSION_FILE = BASE_DIR / "VERSION"
DESKTOP_BUILD_ID_FILE = BASE_DIR / "DESKTOP_BUILD_ID"
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

GITHUB_REPO_URL = "https://github.com/Aliax-LI/Infinite-Canvas-V1"


def current_app_version() -> str:
    try:
        version = VERSION_FILE.read_text(encoding="utf-8").strip().splitlines()[0].strip()
        if version:
            return version
    except (FileNotFoundError, IndexError, OSError):
        pass
    return "0.0.0"


def current_desktop_build_id() -> str:
    try:
        return DESKTOP_BUILD_ID_FILE.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    except (FileNotFoundError, IndexError, OSError):
        return ""


def version_tuple(value: str) -> list[int]:
    import re

    return [int(part) for part in re.findall(r"\d+", str(value or ""))]


def version_gt(a: str, b: str) -> bool:
    left = version_tuple(a)
    right = version_tuple(b)
    size = max(len(left), len(right))
    left += [0] * (size - len(left))
    right += [0] * (size - len(right))
    return left > right


def fetch_github_latest_release(timeout: float = 5.0) -> dict[str, Any]:
    url = f"{GITHUB_REPO_URL.replace('https://github.com/', 'https://api.github.com/repos/')}/releases/latest"
    try:
        response = requests.get(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "Infinite-Canvas-Updater",
            },
            timeout=timeout,
        )
        if response.status_code == 404:
            return {"ok": False, "error": "尚未发布 GitHub Release", "url": url}
        if not (200 <= response.status_code < 400):
            return {"ok": False, "error": f"HTTP {response.status_code}", "url": url}
        payload = response.json()
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc), "url": url}

    version = str(payload.get("tag_name") or "").strip().lstrip("v")
    return {
        "ok": bool(version),
        "version": version,
        "release_url": str(payload.get("html_url") or f"{GITHUB_REPO_URL}/releases"),
        "release_notes": str(payload.get("body") or ""),
        "url": url,
        "error": "" if version else "GitHub Release 缺少 tag_name",
    }


app = FastAPI(title="Infinite Canvas Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/app-info")
def app_info() -> dict[str, Any]:
    return {
        "version": current_app_version(),
        "desktop_build_id": current_desktop_build_id(),
        "is_electron": True,
        "repo_url": GITHUB_REPO_URL,
        "release_url": f"{GITHUB_REPO_URL}/releases",
    }


@app.get("/api/check-update")
def check_update() -> dict[str, Any]:
    current = current_app_version()
    latest_release = fetch_github_latest_release()
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
        "update_available": bool(latest and version_gt(str(latest.get("version") or ""), current)),
        "desktop_build_id": current_desktop_build_id(),
        "reachable": bool(latest_release.get("ok")),
        "error": latest_release.get("error", ""),
    }


@app.post("/api/update-from-github")
def update_from_github_removed() -> None:
    from fastapi import HTTPException

    raise HTTPException(status_code=404, detail="应用内热更新已废弃，请前往 GitHub Releases 手动安装新版")


if FRONTEND_DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="spa")
