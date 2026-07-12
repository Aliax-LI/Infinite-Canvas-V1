from __future__ import annotations

from typing import Any

from backend.config import PROMPT_LIBRARY_PATH, ensure_data_dirs
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import PromptLibraryRepository


class JsonPromptLibraryRepository(PromptLibraryRepository):
    def load(self) -> dict[str, Any]:
        return read_json_file(PROMPT_LIBRARY_PATH, {})

    def save(self, data: dict[str, Any]) -> None:
        ensure_data_dirs()
        write_json_file(PROMPT_LIBRARY_PATH, data)
