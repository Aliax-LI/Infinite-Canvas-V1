from __future__ import annotations

from typing import Any

from backend.config import ASSET_LIBRARY_PATH, ensure_data_dirs
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import AssetLibraryRepository


class JsonAssetLibraryRepository(AssetLibraryRepository):
    def load(self) -> dict[str, Any]:
        return read_json_file(ASSET_LIBRARY_PATH, {"categories": [], "assets": []})

    def save(self, library: dict[str, Any]) -> None:
        ensure_data_dirs()
        write_json_file(ASSET_LIBRARY_PATH, library)
