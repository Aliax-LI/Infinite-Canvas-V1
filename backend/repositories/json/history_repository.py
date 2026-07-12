from __future__ import annotations

import time
from typing import Any

from backend.config import HISTORY_PATH
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import HistoryRepository

HISTORY_LOCK = __import__("threading").Lock()


class JsonHistoryRepository(HistoryRepository):
    def load_all(self) -> list[dict[str, Any]]:
        data = read_json_file(HISTORY_PATH, [])
        return data if isinstance(data, list) else []

    def save_all(self, records: list[dict[str, Any]]) -> None:
        with HISTORY_LOCK:
            write_json_file(HISTORY_PATH, records, indent=4)

    def append(self, record: dict[str, Any]) -> None:
        with HISTORY_LOCK:
            history = self.load_all()
            item = dict(record)
            item.setdefault("timestamp", time.time())
            history.insert(0, item)
            write_json_file(HISTORY_PATH, history[:5000], indent=4)
