import pytest

from backend.repositories import get_canvas_repository, get_project_repository, reset_repositories
from backend.repositories.sqlite.canvas_repository import SqliteCanvasRepository


@pytest.fixture
def sqlite_canvas_repo(tmp_path, monkeypatch):
    db_path = tmp_path / "infinite-canvas.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    yield SqliteCanvasRepository(db_path)


def test_canvas_save_load_roundtrip(sqlite_canvas_repo):
    canvas = {"id": "abc123", "title": "Test", "nodes": [], "connections": []}
    sqlite_canvas_repo.save(canvas)
    loaded = sqlite_canvas_repo.load_any("abc123")
    assert loaded["title"] == "Test"
    assert loaded["updated_at"] > 0


def test_canvas_meta_save_without_touch_updated_at(sqlite_canvas_repo):
    canvas = {"id": "meta1", "title": "T", "updated_at": 100, "nodes": []}
    sqlite_canvas_repo.save(canvas, touch_updated_at=False)
    canvas["title"] = "Renamed"
    sqlite_canvas_repo.save(canvas, touch_updated_at=False)
    loaded = sqlite_canvas_repo.load_any("meta1")
    assert loaded["title"] == "Renamed"
    assert loaded["updated_at"] == 100


def test_canvas_list_documents_filters_deleted(sqlite_canvas_repo):
    active = {"id": "active1", "title": "A", "nodes": []}
    trashed = {"id": "trash1", "title": "B", "deleted_at": 1, "nodes": []}
    sqlite_canvas_repo.save(active)
    sqlite_canvas_repo.save(trashed, touch_updated_at=False)
    assert len(sqlite_canvas_repo.list_documents(include_deleted=False)) == 1
    assert len(sqlite_canvas_repo.list_documents(include_deleted=True)) == 1


def test_factory_selects_sqlite_repositories(tmp_path, monkeypatch):
    db_path = tmp_path / "infinite-canvas.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "sqlite")
    reset_repositories()
    try:
        from backend.repositories.sqlite.project_repository import SqliteProjectRepository
        from backend.repositories.sqlite.canvas_repository import SqliteCanvasRepository

        assert isinstance(get_project_repository(), SqliteProjectRepository)
        assert isinstance(get_canvas_repository(), SqliteCanvasRepository)
    finally:
        monkeypatch.setattr("backend.config.STORAGE_BACKEND", "json")
        reset_repositories()
