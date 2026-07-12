"""Build SHA-256 inventory of JSON source files before migration."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ManifestEntry:
    relative_path: str
    sha256: str
    size_bytes: int


@dataclass
class MigrationManifest:
    created_at_ms: int
    data_dir: str
    entries: list[ManifestEntry] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "created_at_ms": self.created_at_ms,
            "data_dir": self.data_dir,
            "entries": [
                {"relative_path": e.relative_path, "sha256": e.sha256, "size_bytes": e.size_bytes}
                for e in self.entries
            ],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MigrationManifest:
        entries = [
            ManifestEntry(
                relative_path=str(item.get("relative_path") or ""),
                sha256=str(item.get("sha256") or ""),
                size_bytes=int(item.get("size_bytes") or 0),
            )
            for item in (data.get("entries") or [])
            if isinstance(item, dict)
        ]
        return cls(
            created_at_ms=int(data.get("created_at_ms") or 0),
            data_dir=str(data.get("data_dir") or ""),
            entries=entries,
        )


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_json_sources(data_dir: Path) -> list[Path]:
    files: list[Path] = []
    single_files = (
        "projects.json",
        "asset_library.json",
        "prompt_libraries.json",
        "api_providers.json",
        "shared_folders.json",
        "runninghub_workflows.json",
        "history.json",
    )
    for name in single_files:
        path = data_dir / name
        if path.is_file():
            files.append(path)
    canvas_dir = data_dir / "canvases"
    if canvas_dir.is_dir():
        files.extend(sorted(canvas_dir.glob("*.json")))
    conv_dir = data_dir / "conversations"
    if conv_dir.is_dir():
        files.extend(sorted(conv_dir.rglob("*.json")))
    return files


def build_manifest(data_dir: Path) -> MigrationManifest:
    entries: list[ManifestEntry] = []
    for path in collect_json_sources(data_dir):
        rel = path.relative_to(data_dir).as_posix()
        entries.append(
            ManifestEntry(
                relative_path=rel,
                sha256=_sha256_file(path),
                size_bytes=path.stat().st_size,
            )
        )
    return MigrationManifest(
        created_at_ms=int(time.time() * 1000),
        data_dir=str(data_dir.resolve()),
        entries=entries,
    )


def save_manifest(manifest: MigrationManifest, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def load_manifest(path: Path) -> MigrationManifest:
    data = json.loads(path.read_text(encoding="utf-8"))
    return MigrationManifest.from_dict(data if isinstance(data, dict) else {})
