import os
from threading import Lock

from backend.config import HISTORY_PATH
from backend.repositories import get_history_repository
from backend.services.media_paths import output_file_from_url

HISTORY_FILE = HISTORY_PATH
HISTORY_LOCK = Lock()


def list_history(type_filter: str | None = None) -> list[dict]:
    data = get_history_repository().load_all()
    if type_filter:
        data = [item for item in data if isinstance(item, dict) and item.get("type", "zimage") == type_filter]
    data = [item for item in data if isinstance(item, dict) and item.get("images")]

    def sort_key(item: dict) -> float:
        ts = item.get("timestamp", 0)
        return float(ts) if isinstance(ts, (int, float)) else 0.0

    return sorted(data, key=sort_key, reverse=True)


def _timestamp_matches(item_ts, target_ts: float) -> bool:
    if isinstance(item_ts, (int, float)):
        return abs(float(item_ts) - float(target_ts)) < 0.001
    return str(item_ts) == str(target_ts)


def _remove_media_files(record: dict) -> None:
    for img_url in record.get("images", []) or []:
        file_path = output_file_from_url(img_url)
        if file_path and os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass


def delete_history(timestamp: float) -> dict:
    result = delete_history_batch([timestamp])
    if result.get("deleted", 0) == 0:
        return {"success": False, "message": result.get("message", "Record not found")}
    return {"success": True}


def delete_history_batch(timestamps: list[float]) -> dict:
    if not timestamps:
        return {"success": True, "deleted": 0, "failed": 0}
    repo = get_history_repository()
    if not HISTORY_FILE.is_file():
        return {"success": False, "message": "History file not found", "deleted": 0, "failed": len(timestamps)}
    target_set = {float(ts) for ts in timestamps}
    try:
        removed_records: list[dict] = []
        with HISTORY_LOCK:
            history = repo.load_all()
            if not isinstance(history, list):
                return {"success": False, "message": "Invalid history file", "deleted": 0, "failed": len(timestamps)}
            new_history = []
            for item in history:
                if not isinstance(item, dict):
                    new_history.append(item)
                    continue
                item_ts = item.get("timestamp", 0)
                matched = False
                for target_ts in target_set:
                    if _timestamp_matches(item_ts, target_ts):
                        matched = True
                        removed_records.append(item)
                        break
                if not matched:
                    new_history.append(item)
            if removed_records:
                repo.save_all(new_history)
        for record in removed_records:
            _remove_media_files(record)
        deleted = len(removed_records)
        failed = len(timestamps) - deleted
        if deleted == 0:
            return {"success": False, "message": "Record not found", "deleted": 0, "failed": failed}
        return {"success": True, "deleted": deleted, "failed": failed}
    except (OSError, TypeError, ValueError) as exc:
        return {"success": False, "message": str(exc), "deleted": 0, "failed": len(timestamps)}


def append_history_record(record: dict) -> None:
    with HISTORY_LOCK:
        get_history_repository().append(record)


def _record_has_existing_media(item: dict) -> bool:
    urls: list[str] = []
    for key in ("images", "videos", "outputs"):
        for value in item.get(key) or []:
            if isinstance(value, str) and value:
                urls.append(value)
    for entry in item.get("image_items") or []:
        if isinstance(entry, dict):
            url = entry.get("url")
            if isinstance(url, str) and url:
                urls.append(url)
    if not urls:
        return False
    for url in urls:
        file_path = output_file_from_url(url)
        if file_path and os.path.isfile(file_path):
            return True
    return False


def purge_missing_history(type_filter: str | None = None) -> dict:
    """Remove history rows whose media files no longer exist on disk."""
    repo = get_history_repository()
    with HISTORY_LOCK:
        history = repo.load_all()
        if not isinstance(history, list):
            return {"success": False, "message": "Invalid history file", "removed": 0, "kept": 0}
        kept: list[dict] = []
        removed = 0
        for item in history:
            if not isinstance(item, dict):
                kept.append(item)
                continue
            if type_filter and item.get("type", "zimage") != type_filter:
                kept.append(item)
                continue
            if _record_has_existing_media(item):
                kept.append(item)
            else:
                removed += 1
        if removed:
            repo.save_all(kept)
    return {"success": True, "removed": removed, "kept": len(kept)}
