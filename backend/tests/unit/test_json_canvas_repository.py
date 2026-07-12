import json

import pytest

from backend.repositories import reset_repositories
from backend.repositories.json.canvas_repository import JsonCanvasRepository


@pytest.fixture
def canvas_repo(tmp_path, monkeypatch):
    canvas_dir = tmp_path / "canvases"
    canvas_dir.mkdir()
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.canvas_repository.CANVAS_DIR", canvas_dir)
    reset_repositories()
    yield JsonCanvasRepository()
    reset_repositories()


def test_canvas_save_load_roundtrip(canvas_repo):
    canvas = {"id": "abc123", "title": "Test", "nodes": [], "connections": []}
    canvas_repo.save(canvas)
    loaded = canvas_repo.load_any("abc123")
    assert loaded["title"] == "Test"
    assert loaded["updated_at"] > 0


def test_canvas_meta_save_without_touch_updated_at(canvas_repo):
    canvas = {"id": "meta1", "title": "T", "updated_at": 100, "nodes": []}
    canvas_repo.save(canvas, touch_updated_at=False)
    canvas["title"] = "Renamed"
    canvas_repo.save(canvas, touch_updated_at=False)
    loaded = canvas_repo.load_any("meta1")
    assert loaded["title"] == "Renamed"
    assert loaded["updated_at"] == 100


def test_canvas_list_documents_filters_deleted(canvas_repo):
    active = {"id": "active1", "title": "A", "nodes": []}
    trashed = {"id": "trash1", "title": "B", "deleted_at": 1, "nodes": []}
    canvas_repo.save(active)
    canvas_repo.save(trashed, touch_updated_at=False)
    assert len(canvas_repo.list_documents(include_deleted=False)) == 1
    assert len(canvas_repo.list_documents(include_deleted=True)) == 1
    assert len(canvas_repo.list_documents(include_deleted=False)) + len(
        canvas_repo.list_documents(include_deleted=True)
    ) == 2


def test_canvas_service_uses_repository(tmp_path, monkeypatch):
    from backend.services import canvas_service

    canvas_dir = tmp_path / "canvases"
    canvas_dir.mkdir()
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.canvas_repository.CANVAS_DIR", canvas_dir)
    reset_repositories()

    created = canvas_service.new_canvas(title="Repo Canvas")
    assert created["title"] == "Repo Canvas"
    assert (canvas_dir / f"{created['id']}.json").is_file()
    reset_repositories()
