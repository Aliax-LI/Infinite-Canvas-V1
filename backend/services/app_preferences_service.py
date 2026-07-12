import json
import os

from backend.config import DATA_DIR, ensure_data_dirs
from backend.services.common import now_ms

APP_PREFERENCES_PATH = DATA_DIR / "app_preferences.json"

DEFAULT_PREFERENCES = {
    "asset_annotation": {
        "provider": "",
        "model": "",
        "ms_model": "",
        "prompt": "",
    },
    "updated_at": 0,
}


def load_app_preferences() -> dict:
    ensure_data_dirs()
    if not APP_PREFERENCES_PATH.is_file():
        return {**DEFAULT_PREFERENCES, "updated_at": now_ms()}
    try:
        with open(APP_PREFERENCES_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    merged = {**DEFAULT_PREFERENCES, **data}
    annotation = merged.get("asset_annotation")
    if not isinstance(annotation, dict):
        annotation = DEFAULT_PREFERENCES["asset_annotation"].copy()
    merged["asset_annotation"] = {
        **DEFAULT_PREFERENCES["asset_annotation"],
        **annotation,
    }
    merged["updated_at"] = int(merged.get("updated_at") or now_ms())
    return merged


def save_app_preferences(prefs: dict) -> dict:
    ensure_data_dirs()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    prefs = {**DEFAULT_PREFERENCES, **(prefs or {})}
    annotation = prefs.get("asset_annotation")
    if not isinstance(annotation, dict):
        annotation = DEFAULT_PREFERENCES["asset_annotation"].copy()
    prefs["asset_annotation"] = {
        **DEFAULT_PREFERENCES["asset_annotation"],
        **annotation,
    }
    prefs["updated_at"] = now_ms()
    with open(APP_PREFERENCES_PATH, "w", encoding="utf-8") as f:
        json.dump(prefs, f, ensure_ascii=False, indent=2)
    return prefs


def asset_annotation_settings() -> dict:
    return dict(load_app_preferences().get("asset_annotation") or DEFAULT_PREFERENCES["asset_annotation"])
