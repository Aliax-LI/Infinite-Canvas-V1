import json
from pathlib import Path

from backend.config import BASE_DIR

HISTORY_FILE = BASE_DIR / "history.json"


def list_history(type_filter: str | None = None) -> list[dict]:
    if not HISTORY_FILE.is_file():
        return []
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    if type_filter:
        data = [item for item in data if isinstance(item, dict) and item.get("type", "zimage") == type_filter]
    data = [item for item in data if isinstance(item, dict) and item.get("images")]

    def sort_key(item: dict) -> float:
        ts = item.get("timestamp", 0)
        return float(ts) if isinstance(ts, (int, float)) else 0.0

    return sorted(data, key=sort_key, reverse=True)


import os
from threading import Lock

from backend.services.media_paths import output_file_from_url

HISTORY_LOCK = Lock()


def _timestamp_matches(item_ts, target_ts: float) -> bool:
    if isinstance(item_ts, (int, float)):
        return abs(float(item_ts) - float(target_ts)) < 0.001
    return str(item_ts) == str(target_ts)


def delete_history(timestamp: float) -> dict:
    if not HISTORY_FILE.is_file():
        return {"success": False, "message": "History file not found"}
    try:
        with HISTORY_LOCK:
            history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            if not isinstance(history, list):
                return {"success": False, "message": "Invalid history file"}
            target_record = None
            new_history = []
            for item in history:
                if not isinstance(item, dict):
                    new_history.append(item)
                    continue
                if _timestamp_matches(item.get("timestamp", 0), timestamp):
                    target_record = item
                else:
                    new_history.append(item)
            if target_record:
                HISTORY_FILE.write_text(json.dumps(new_history, ensure_ascii=False, indent=4), encoding="utf-8")
        if not target_record:
            return {"success": False, "message": "Record not found"}
        for img_url in target_record.get("images", []) or []:
            file_path = output_file_from_url(img_url)
            if file_path and os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    pass
        return {"success": True}
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        return {"success": False, "message": str(exc)}


def append_history_record(record: dict) -> None:
    import time

    with HISTORY_LOCK:
        history: list = []
        if HISTORY_FILE.is_file():
            try:
                history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                history = []
        if not isinstance(history, list):
            history = []
        item = dict(record)
        item.setdefault("timestamp", time.time())
        history.insert(0, item)
        HISTORY_FILE.write_text(json.dumps(history[:5000], ensure_ascii=False, indent=4), encoding="utf-8")
