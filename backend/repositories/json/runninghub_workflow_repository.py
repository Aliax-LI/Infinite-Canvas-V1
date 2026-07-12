from __future__ import annotations

from typing import Any

from backend.config import RUNNINGHUB_WORKFLOW_STORE_PATH, ensure_data_dirs
from backend.repositories.json.base import read_json_file, write_json_file
from backend.repositories.protocols import RunningHubWorkflowRepository


class JsonRunningHubWorkflowRepository(RunningHubWorkflowRepository):
    def load(self) -> dict[str, Any]:
        return read_json_file(RUNNINGHUB_WORKFLOW_STORE_PATH, {})

    def save(self, store: dict[str, Any]) -> None:
        ensure_data_dirs()
        write_json_file(RUNNINGHUB_WORKFLOW_STORE_PATH, store)
