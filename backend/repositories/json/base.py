from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, TypeVar

T = TypeVar("T")


def read_json_file(path: Path, default: T) -> T:
    if not path.is_file():
        return default
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return default


def write_json_file(path: Path, data: Any, *, indent: int = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)


def list_json_files(directory: Path, suffix: str = ".json") -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(directory.glob(f"*{suffix}"))
