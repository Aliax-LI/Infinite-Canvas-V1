import pytest

from backend import config


def _patch_data_dir(monkeypatch, tmp_path, *, projects_json: bool = False):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "DATABASE_PATH", data_dir / "infinite-canvas.db")
    monkeypatch.setattr(config, "PROJECTS_PATH", data_dir / "projects.json")
    monkeypatch.setattr(config, "ASSET_LIBRARY_PATH", data_dir / "asset_library.json")
    monkeypatch.setattr(config, "PROMPT_LIBRARY_PATH", data_dir / "prompt_libraries.json")
    monkeypatch.setattr(config, "API_PROVIDERS_PATH", data_dir / "api_providers.json")
    monkeypatch.setattr(config, "SHARED_FOLDERS_PATH", data_dir / "shared_folders.json")
    monkeypatch.setattr(config, "HISTORY_PATH", data_dir / "history.json")
    monkeypatch.setattr(config, "RUNNINGHUB_WORKFLOW_STORE_PATH", data_dir / "runninghub_workflows.json")
    monkeypatch.setattr(config, "CANVAS_DIR", data_dir / "canvases")
    monkeypatch.setattr(config, "CONVERSATION_DIR", data_dir / "conversations")
    if projects_json:
        (data_dir / "projects.json").write_text("{}", encoding="utf-8")


def test_resolve_storage_backend_new_install_defaults_sqlite(tmp_path, monkeypatch):
    _patch_data_dir(monkeypatch, tmp_path)
    monkeypatch.delenv("INFINITE_CANVAS_STORAGE_BACKEND", raising=False)
    assert config.resolve_storage_backend() == "sqlite"


def test_resolve_storage_backend_legacy_json(tmp_path, monkeypatch):
    _patch_data_dir(monkeypatch, tmp_path, projects_json=True)
    monkeypatch.delenv("INFINITE_CANVAS_STORAGE_BACKEND", raising=False)
    assert config.resolve_storage_backend() == "json"


def test_resolve_storage_backend_explicit_env(tmp_path, monkeypatch):
    _patch_data_dir(monkeypatch, tmp_path, projects_json=True)
    monkeypatch.setenv("INFINITE_CANVAS_STORAGE_BACKEND", "sqlite")
    assert config.resolve_storage_backend() == "sqlite"


def test_resolve_storage_backend_migration_marker_without_env(tmp_path, monkeypatch):
    _patch_data_dir(monkeypatch, tmp_path, projects_json=True)
    marker = tmp_path / "data" / ".sqlite_migration_complete"
    marker.write_text("{}", encoding="utf-8")
    monkeypatch.delenv("INFINITE_CANVAS_STORAGE_BACKEND", raising=False)
    assert config.resolve_storage_backend() == "sqlite"
