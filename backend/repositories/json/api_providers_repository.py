from __future__ import annotations

from typing import Any

from backend.config import API_PROVIDERS_PATH, ensure_data_dirs
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import ApiProvidersRepository


class JsonApiProvidersRepository(ApiProvidersRepository):
    def load_all(self) -> list[dict[str, Any]]:
        raw = read_json_file(API_PROVIDERS_PATH, [])
        if isinstance(raw, list):
            return [p for p in raw if isinstance(p, dict)]
        return []

    def save_all(self, providers: list[dict[str, Any]]) -> None:
        ensure_data_dirs()
        write_json_file(API_PROVIDERS_PATH, providers)
