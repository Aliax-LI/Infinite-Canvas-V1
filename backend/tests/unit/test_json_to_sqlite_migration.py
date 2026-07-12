import json

import pytest

from backend import config
from backend.storage.json_to_sqlite import (
    count_json_entities,
    count_sqlite_entities,
    migrate_json_to_sqlite,
    migration_complete,
    verify_entity_counts,
)
from backend.storage.migration_manifest import build_manifest, collect_json_sources


def _patch_data_dir(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    canvases = data_dir / "canvases"
    canvases.mkdir()
    conv_root = data_dir / "conversations" / "user-1"
    conv_root.mkdir(parents=True)

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "DATABASE_PATH", data_dir / "infinite-canvas.db")
    monkeypatch.setattr(config, "PROJECTS_PATH", data_dir / "projects.json")
    monkeypatch.setattr(config, "ASSET_LIBRARY_PATH", data_dir / "asset_library.json")
    monkeypatch.setattr(config, "PROMPT_LIBRARY_PATH", data_dir / "prompt_libraries.json")
    monkeypatch.setattr(config, "API_PROVIDERS_PATH", data_dir / "api_providers.json")
    monkeypatch.setattr(config, "SHARED_FOLDERS_PATH", data_dir / "shared_folders.json")
    monkeypatch.setattr(config, "HISTORY_PATH", data_dir / "history.json")
    monkeypatch.setattr(config, "RUNNINGHUB_WORKFLOW_STORE_PATH", data_dir / "runninghub_workflows.json")
    monkeypatch.setattr(config, "CANVAS_DIR", canvases)
    monkeypatch.setattr(config, "CONVERSATION_DIR", data_dir / "conversations")
    monkeypatch.setattr(config, "MIGRATIONS_DIR", config.MIGRATIONS_DIR)
    return data_dir


def _seed_legacy_json(data_dir):
    (data_dir / "projects.json").write_text(
        json.dumps({"projects": [{"id": "p1", "name": "Demo", "order": 0, "created_at": 1, "updated_at": 2}]}),
        encoding="utf-8",
    )
    (data_dir / "canvases" / "c1.json").write_text(
        json.dumps({"id": "c1", "project": "p1", "title": "Canvas", "created_at": 1, "updated_at": 2}),
        encoding="utf-8",
    )
    (data_dir / "api_providers.json").write_text(
        json.dumps([{"id": "prov1", "name": "Test", "protocol": "openai"}]),
        encoding="utf-8",
    )
    (data_dir / "prompt_libraries.json").write_text(json.dumps({"libraries": []}), encoding="utf-8")
    (data_dir / "asset_library.json").write_text(json.dumps({"assets": [], "categories": []}), encoding="utf-8")
    (data_dir / "shared_folders.json").write_text(json.dumps({"folders": []}), encoding="utf-8")
    (data_dir / "runninghub_workflows.json").write_text(json.dumps({"workflows": []}), encoding="utf-8")
    (data_dir / "history.json").write_text(json.dumps([{"id": "h1", "timestamp": 1.0, "action": "test"}]), encoding="utf-8")
    (data_dir / "conversations" / "user-1" / "conv1.json").write_text(
        json.dumps({"id": "conv1", "title": "Chat", "messages": [], "created_at": 1, "updated_at": 2}),
        encoding="utf-8",
    )


def test_build_manifest_includes_all_sources(tmp_path, monkeypatch):
    data_dir = _patch_data_dir(monkeypatch, tmp_path)
    _seed_legacy_json(data_dir)
    manifest = build_manifest(data_dir)
    rel_paths = {e.relative_path for e in manifest.entries}
    assert "projects.json" in rel_paths
    assert "canvases/c1.json" in rel_paths
    assert len(collect_json_sources(data_dir)) == len(manifest.entries)


def test_migrate_json_to_sqlite_success(tmp_path, monkeypatch):
    data_dir = _patch_data_dir(monkeypatch, tmp_path)
    _seed_legacy_json(data_dir)
    db_path = data_dir / "infinite-canvas.db"

    report = migrate_json_to_sqlite(data_dir=data_dir, db_path=db_path)
    assert report.success is True
    assert migration_complete(data_dir)
    ok, mismatches = verify_entity_counts(data_dir, db_path)
    assert ok, mismatches
    assert count_json_entities(data_dir)["projects"] == count_sqlite_entities(db_path)["projects"]


def test_migrate_is_idempotent_after_marker(tmp_path, monkeypatch):
    data_dir = _patch_data_dir(monkeypatch, tmp_path)
    _seed_legacy_json(data_dir)
    db_path = data_dir / "infinite-canvas.db"

    first = migrate_json_to_sqlite(data_dir=data_dir, db_path=db_path)
    assert first.success
    second = migrate_json_to_sqlite(data_dir=data_dir, db_path=db_path)
    assert second.success
    assert second.error == "already_migrated"


def test_resolve_storage_backend_after_migration(tmp_path, monkeypatch):
    data_dir = _patch_data_dir(monkeypatch, tmp_path)
    _seed_legacy_json(data_dir)
    (data_dir / "projects.json").touch()
    monkeypatch.delenv("INFINITE_CANVAS_STORAGE_BACKEND", raising=False)
    assert config.resolve_storage_backend() == "json"
    migrate_json_to_sqlite(data_dir=data_dir, db_path=data_dir / "infinite-canvas.db")
    assert config.resolve_storage_backend() == "sqlite"
