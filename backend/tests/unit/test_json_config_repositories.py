import pytest

from backend.repositories import reset_repositories
from backend.repositories.json.api_providers_repository import JsonApiProvidersRepository


@pytest.fixture
def providers_repo(tmp_path, monkeypatch):
    path = tmp_path / "api_providers.json"
    monkeypatch.setattr("backend.config.API_PROVIDERS_PATH", path)
    monkeypatch.setattr("backend.repositories.json.api_providers_repository.API_PROVIDERS_PATH", path)
    reset_repositories()
    yield JsonApiProvidersRepository()
    reset_repositories()


def test_api_providers_service_uses_repository(tmp_path, monkeypatch):
    from backend.services import api_providers_service

    path = tmp_path / "api_providers.json"
    monkeypatch.setattr("backend.config.API_PROVIDERS_PATH", path)
    monkeypatch.setattr("backend.repositories.json.api_providers_repository.API_PROVIDERS_PATH", path)
    reset_repositories()

    providers = api_providers_service.load_api_providers()
    assert any(p["id"] == "modelscope" for p in providers)
    providers[0]["primary"] = True
    api_providers_service.save_api_providers(providers)
    reloaded = api_providers_service.load_api_providers()
    assert reloaded[0]["primary"] is True
    reset_repositories()


def test_shared_folders_service_uses_repository(tmp_path, monkeypatch):
    from backend.services import shared_folders_service

    path = tmp_path / "shared_folders.json"
    monkeypatch.setattr("backend.config.SHARED_FOLDERS_PATH", path)
    monkeypatch.setattr("backend.repositories.json.shared_folders_repository.SHARED_FOLDERS_PATH", path)
    reset_repositories()

    shared_folders_service.shared_folders_save({"folders": [{"id": "f1", "rel": "data"}]})
    loaded = shared_folders_service.shared_folders_load()
    assert loaded["folders"][0]["id"] == "f1"
    reset_repositories()
