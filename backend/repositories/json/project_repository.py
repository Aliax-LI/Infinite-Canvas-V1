from __future__ import annotations

import json
import os
from typing import Any

from backend.repositories import get_canvas_repository
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import ProjectRepository
from backend.config import PROJECTS_PATH, ensure_data_dirs
from backend.services.common import CANVAS_LOCK


class JsonProjectRepository(ProjectRepository):
    def load_all(self) -> list[dict[str, Any]]:
        data = read_json_file(PROJECTS_PATH, {})
        projects = data.get("projects") if isinstance(data, dict) else data
        if isinstance(projects, list):
            return [p for p in projects if isinstance(p, dict) and p.get("id")]
        return []

    def save_all(self, projects: list[dict[str, Any]]) -> None:
        ensure_data_dirs()
        with CANVAS_LOCK:
            write_json_file(PROJECTS_PATH, {"projects": projects})

    def reassign_canvases(self, from_project_id: str, to_project_id: str) -> int:
        return get_canvas_repository().reassign_project(from_project_id, to_project_id)
