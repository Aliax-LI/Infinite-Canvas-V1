import pytest

from backend.repositories.sqlite.asset_library_repository import SqliteAssetLibraryRepository
from backend.repositories.sqlite.prompt_library_repository import SqlitePromptLibraryRepository
from backend.repositories.sqlite.runninghub_workflow_repository import SqliteRunningHubWorkflowRepository
from backend.repositories.sqlite.shared_folders_repository import SqliteSharedFoldersRepository
from backend.repositories.sqlite.workflow_repository import SqliteWorkflowRepository


@pytest.fixture
def sqlite_db(tmp_path, monkeypatch):
    db_path = tmp_path / "infinite-canvas.db"
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    return db_path


def test_sqlite_asset_library_roundtrip(sqlite_db):
    repo = SqliteAssetLibraryRepository(sqlite_db)
    lib = {"libraries": [], "active_library_id": "main", "categories": []}
    repo.save(lib)
    assert repo.load()["active_library_id"] == "main"


def test_sqlite_prompt_library_roundtrip(sqlite_db):
    repo = SqlitePromptLibraryRepository(sqlite_db)
    repo.save({"libraries": [{"id": "p1", "name": "Default"}]})
    assert repo.load()["libraries"][0]["id"] == "p1"


def test_sqlite_shared_folders_roundtrip(sqlite_db):
    repo = SqliteSharedFoldersRepository(sqlite_db)
    repo.save({"folders": [{"id": "f1", "rel": "media"}]})
    assert repo.load()["folders"][0]["id"] == "f1"


def test_sqlite_runninghub_store_roundtrip(sqlite_db):
    repo = SqliteRunningHubWorkflowRepository(sqlite_db)
    repo.save({"wf1": {"nodes": []}})
    assert "wf1" in repo.load()


def test_sqlite_workflow_roundtrip(sqlite_db, tmp_path, monkeypatch):
    workflow_dir = tmp_path / "workflows"
    workflow_dir.mkdir()
    monkeypatch.setattr("backend.config.WORKFLOW_DIR", workflow_dir)
    repo = SqliteWorkflowRepository(sqlite_db)
    repo.save_workflow("custom/demo", {"nodes": {}})
    repo.save_config("custom/demo", {"title": "Demo"})
    assert repo.workflow_exists("custom/demo")
    assert repo.load_workflow("custom/demo") == {"nodes": {}}
    assert repo.load_config("custom/demo")["title"] == "Demo"
    assert "custom/demo" in repo.list_workflows()
    repo.delete_workflow("custom/demo")
    assert not repo.workflow_exists("custom/demo")
