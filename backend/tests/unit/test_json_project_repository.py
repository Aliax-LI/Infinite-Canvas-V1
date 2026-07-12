import json

import pytest

from backend.config import CANVAS_DIR, DEFAULT_PROJECT_ID, PROJECTS_PATH
from backend.repositories import reset_repositories
from backend.repositories.json.project_repository import JsonProjectRepository


@pytest.fixture
def project_repo(tmp_path, monkeypatch):
    projects_path = tmp_path / "projects.json"
    canvas_dir = tmp_path / "canvases"
    canvas_dir.mkdir()
    monkeypatch.setattr("backend.config.PROJECTS_PATH", projects_path)
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.project_repository.PROJECTS_PATH", projects_path)
    monkeypatch.setattr("backend.repositories.json.canvas_repository.CANVAS_DIR", canvas_dir)
    reset_repositories()
    yield JsonProjectRepository()
    reset_repositories()


def test_load_save_roundtrip(project_repo):
    project_repo.save_all([{"id": "p1", "name": "A", "order": 1}])
    loaded = project_repo.load_all()
    assert len(loaded) == 1
    assert loaded[0]["id"] == "p1"


def test_reassign_canvases(project_repo, tmp_path):
    canvas_dir = tmp_path / "canvases"
    canvas_file = canvas_dir / "c1.json"
    canvas_file.write_text(
        json.dumps({"id": "c1", "project": "old", "title": "T"}),
        encoding="utf-8",
    )
    moved = project_repo.reassign_canvases("old", DEFAULT_PROJECT_ID)
    assert moved == 1
    data = json.loads(canvas_file.read_text(encoding="utf-8"))
    assert data["project"] == DEFAULT_PROJECT_ID


def test_project_service_uses_repository(tmp_path, monkeypatch):
    from backend.services import project_service

    projects_path = tmp_path / "projects.json"
    canvas_dir = tmp_path / "canvases"
    canvas_dir.mkdir()
    monkeypatch.setattr("backend.config.PROJECTS_PATH", projects_path)
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.project_repository.PROJECTS_PATH", projects_path)
    monkeypatch.setattr("backend.repositories.json.canvas_repository.CANVAS_DIR", canvas_dir)
    reset_repositories()

    created = project_service.new_project("Repo 测试")
    assert created["name"] == "Repo 测试"
    assert PROJECTS_PATH.is_file()
    reset_repositories()
