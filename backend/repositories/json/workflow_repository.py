from __future__ import annotations

import json
import os
from typing import Any

from backend.config import WORKFLOW_DIR
from backend.repositories.protocols import WorkflowRepository

CUSTOM_WORKFLOW_FOLDER = "custom"
LEGACY_CUSTOM_WORKFLOW_FOLDER = "自定义"


class JsonWorkflowRepository(WorkflowRepository):
    def _workflow_json_path(self, name: str) -> str:
        from backend.services.workflow_service import resolve_workflow_name

        rel = name if name.endswith(".json") else f"{name}.json"
        resolved = resolve_workflow_name(rel)
        path = os.path.abspath(os.path.join(str(WORKFLOW_DIR), *resolved.split("/")))
        workflow_root = os.path.abspath(str(WORKFLOW_DIR))
        if os.path.commonpath([workflow_root, path]) != workflow_root:
            raise ValueError("Invalid workflow path")
        if not os.path.isfile(path):
            alt = os.path.abspath(os.path.join(str(WORKFLOW_DIR), *rel.split("/")))
            if os.path.commonpath([workflow_root, alt]) == workflow_root and os.path.isfile(alt):
                return alt
        return path

    def _config_path(self, name: str) -> str:
        base = self._workflow_json_path(name)
        return base.replace(".json", ".config.json")

    def workflow_exists(self, name: str) -> bool:
        return os.path.isfile(self._workflow_json_path(name))

    def load_workflow(self, name: str) -> dict[str, Any]:
        with open(self._workflow_json_path(name), encoding="utf-8") as f:
            return json.load(f)

    def save_workflow(self, name: str, workflow: dict[str, Any]) -> None:
        path = self._workflow_json_path(name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(workflow, f, ensure_ascii=False, indent=2)

    def load_config(self, name: str) -> dict[str, Any]:
        cfg_path = self._config_path(name)
        if not os.path.isfile(cfg_path):
            return {}
        with open(cfg_path, encoding="utf-8") as f:
            return json.load(f) or {}

    def save_config(self, name: str, config: dict[str, Any]) -> None:
        cfg_path = self._config_path(name)
        os.makedirs(os.path.dirname(cfg_path), exist_ok=True)
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

    def delete_workflow(self, name: str) -> None:
        workflow_path = self._workflow_json_path(name)
        cfg_path = self._config_path(name)
        if os.path.isfile(workflow_path):
            os.remove(workflow_path)
        if os.path.isfile(cfg_path):
            os.remove(cfg_path)

    def list_workflows(self) -> list[str]:
        if not WORKFLOW_DIR.is_dir():
            return []
        names: list[str] = []
        for root, dirs, files in os.walk(str(WORKFLOW_DIR)):
            if os.path.abspath(root) == os.path.abspath(str(WORKFLOW_DIR)):
                dirs[:] = [d for d in dirs if d in {CUSTOM_WORKFLOW_FOLDER, LEGACY_CUSTOM_WORKFLOW_FOLDER}]
            for fn in sorted(files):
                if not fn.endswith(".json") or fn.endswith(".config.json"):
                    continue
                rel = os.path.relpath(os.path.join(root, fn), str(WORKFLOW_DIR)).replace("\\", "/")
                if rel.endswith(".json"):
                    rel = rel[:-5]
                names.append(rel)
        return sorted(names)
