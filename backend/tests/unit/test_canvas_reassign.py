import json

import pytest

from backend.config import DEFAULT_PROJECT_ID
from backend.repositories import reset_repositories
from backend.repositories.json.canvas_repository import JsonCanvasRepository
from backend.repositories.json.project_repository import JsonProjectRepository


@pytest.fixture
def canvas_and_project_repos(tmp_path, monkeypatch):
    canvas_dir = tmp_path / "canvases"
    projects_path = tmp_path / "projects.json"
    canvas_dir.mkdir()
    monkeypatch.setattr("backend.config.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.config.PROJECTS_PATH", projects_path)
    monkeypatch.setattr("backend.repositories.json.canvas_repository.CANVAS_DIR", canvas_dir)
    monkeypatch.setattr("backend.repositories.json.project_repository.PROJECTS_PATH", projects_path)
    reset_repositories()
    yield JsonCanvasRepository(), JsonProjectRepository()
    reset_repositories()


def test_canvas_reassign_project(canvas_and_project_repos):
    canvas_repo, _ = canvas_and_project_repos
    from backend.config import CANVAS_DIR

    path = CANVAS_DIR / "c1.json"
    path.write_text(json.dumps({"id": "c1", "project": "old", "title": "T"}), encoding="utf-8")
    moved = canvas_repo.reassign_project("old", DEFAULT_PROJECT_ID)
    assert moved == 1
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["project"] == DEFAULT_PROJECT_ID


def test_project_repo_reassign_delegates_to_canvas(canvas_and_project_repos):
    _, project_repo = canvas_and_project_repos
    from backend.config import CANVAS_DIR

    path = CANVAS_DIR / "c2.json"
    path.write_text(json.dumps({"id": "c2", "project": "p-old", "title": "T2"}), encoding="utf-8")
    moved = project_repo.reassign_canvases("p-old", DEFAULT_PROJECT_ID)
    assert moved == 1
