"""Unit tests for unified DATA_DIR path helpers."""

import logging

from backend import config


def test_resolve_under_data_prefers_data_subdir(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.delenv("INFINITE_CANVAS_OUTPUT_DIR", raising=False)
    resolved = config._resolve_under_data("INFINITE_CANVAS_OUTPUT_DIR", "output")
    assert resolved == (data_dir / "output").resolve()


def test_resolve_under_data_explicit_env_wins(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    custom = tmp_path / "custom-output"
    data_dir.mkdir()
    custom.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setenv("INFINITE_CANVAS_OUTPUT_DIR", str(custom))
    resolved = config._resolve_under_data("INFINITE_CANVAS_OUTPUT_DIR", "output")
    assert resolved == custom.resolve()


def test_resolve_under_data_legacy_fallback_when_missing(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    legacy = tmp_path / "output"
    data_dir.mkdir()
    legacy.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.delenv("INFINITE_CANVAS_OUTPUT_DIR", raising=False)
    resolved = config._resolve_under_data(
        "INFINITE_CANVAS_OUTPUT_DIR",
        "output",
        legacy=legacy,
    )
    assert resolved == legacy.resolve()


def test_resolve_under_data_prefers_new_path_when_it_exists(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    nested = data_dir / "output"
    legacy = tmp_path / "output"
    nested.mkdir(parents=True)
    legacy.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.delenv("INFINITE_CANVAS_OUTPUT_DIR", raising=False)
    resolved = config._resolve_under_data(
        "INFINITE_CANVAS_OUTPUT_DIR",
        "output",
        legacy=legacy,
    )
    assert resolved == nested.resolve()


def test_default_module_paths_nest_assets_under_data_dir():
    """Without overrides, ASSETS_DIR aliases OBJECTS_DIR and OUTPUT_DIR nests under DATA_DIR."""
    if config._env_path("INFINITE_CANVAS_OBJECTS_DIR") is None:
        assert config.OBJECTS_DIR == (config.DATA_DIR / "objects").resolve()
    if config._env_path("INFINITE_CANVAS_ASSETS_DIR") is None:
        assert config.ASSETS_DIR == config.OBJECTS_DIR
    if config._env_path("INFINITE_CANVAS_OUTPUT_DIR") is None:
        assert config.OUTPUT_DIR == (config.DATA_DIR / "output").resolve()
    assert str(config.OBJECTS_DIR).startswith(str(config.DATA_DIR)) or config._env_path(
        "INFINITE_CANVAS_OBJECTS_DIR"
    )


def test_log_storage_roots_once_is_idempotent(caplog):
    config._STORAGE_ROOTS_LOGGED = False
    with caplog.at_level(logging.INFO, logger="infinite_canvas.storage"):
        config.log_storage_roots_once()
        config.log_storage_roots_once()
    messages = [r.message for r in caplog.records if "Settings 数据目录" in r.message]
    assert len(messages) == 1
