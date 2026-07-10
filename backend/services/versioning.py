import re
from typing import Any

import requests

from backend.config import DESKTOP_BUILD_ID_FILE, GITHUB_REPO_URL, VERSION_FILE


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
