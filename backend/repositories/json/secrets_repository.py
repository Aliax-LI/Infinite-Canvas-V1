from __future__ import annotations

from typing import Any

from backend.config import DATA_DIR, APP_SECRETS_PATH, ensure_data_dirs
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import SecretsRepository


class JsonSecretsRepository(SecretsRepository):
    def __init__(self, path=None) -> None:
        self._path = path or APP_SECRETS_PATH

    def _load_raw(self) -> dict[str, Any]:
        raw = read_json_file(self._path, {})
        return raw if isinstance(raw, dict) else {}

    def get(self, name: str) -> str | None:
        key = str(name or "").strip()
        if not key:
            return None
        raw = self._load_raw()
        if key not in raw:
            return None
        return str(raw.get(key) or "")

    def set_many(self, updates: dict[str, str]) -> None:
        if not updates:
            return
        ensure_data_dirs()
        raw = self._load_raw()
        for raw_name, raw_value in updates.items():
            name = str(raw_name or "").strip()
            if not name:
                continue
            value = str(raw_value or "")
            if value == "":
                raw.pop(name, None)
            else:
                raw[name] = value
        write_json_file(self._path, raw)

    def load_all(self) -> dict[str, str]:
        raw = self._load_raw()
        return {str(k): str(v or "") for k, v in raw.items() if str(k).strip()}
