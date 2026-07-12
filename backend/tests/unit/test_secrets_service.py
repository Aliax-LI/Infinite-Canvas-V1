import json
import os

from backend.repositories import reset_repositories
from backend.services import secrets_service
from backend.services.api_providers_service import provider_env_key_value, public_provider


def test_json_secrets_roundtrip(tmp_path, monkeypatch):
    secrets_path = tmp_path / "app_secrets.json"
    monkeypatch.setattr("backend.config.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.repositories.json.secrets_repository.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "json")
    monkeypatch.setattr("backend.repositories.factory.STORAGE_BACKEND", "json")
    reset_repositories()

    secrets_service.set_secrets({"MODELSCOPE_API_KEY": "ms-secret-1"})
    assert secrets_path.is_file()
    assert json.loads(secrets_path.read_text(encoding="utf-8"))["MODELSCOPE_API_KEY"] == "ms-secret-1"
    assert secrets_service.get_secret("MODELSCOPE_API_KEY") == "ms-secret-1"
    assert os.getenv("MODELSCOPE_API_KEY") == "ms-secret-1"

    secrets_service.set_secrets({"MODELSCOPE_API_KEY": ""})
    assert "MODELSCOPE_API_KEY" not in json.loads(secrets_path.read_text(encoding="utf-8"))
    assert os.getenv("MODELSCOPE_API_KEY") == ""
    reset_repositories()


def test_provider_env_key_value_reads_secrets_store(tmp_path, monkeypatch):
    secrets_path = tmp_path / "app_secrets.json"
    monkeypatch.setattr("backend.config.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.repositories.json.secrets_repository.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "json")
    monkeypatch.setattr("backend.repositories.factory.STORAGE_BACKEND", "json")
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    reset_repositories()

    secrets_service.set_secrets({"ARK_API_KEY": "volc-from-db"})
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    assert provider_env_key_value("volcengine") == "volc-from-db"

    public = public_provider(
        {
            "id": "volcengine",
            "name": "火山引擎",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "protocol": "volcengine",
            "enabled": True,
            "primary": False,
            "image_models": [],
            "chat_models": [],
            "video_models": [],
        }
    )
    assert public["has_key"] is True
    assert public["key_preview"].endswith("m-db")
    reset_repositories()


def test_migrate_env_secrets_into_store(tmp_path, monkeypatch):
    secrets_path = tmp_path / "app_secrets.json"
    env_file = tmp_path / "config" / "api.env"
    env_file.parent.mkdir(parents=True)
    env_file.write_text('MODELSCOPE_API_KEY="from-env-file"\nARK_API_KEY=volc-env\n', encoding="utf-8")

    monkeypatch.setattr("backend.config.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.repositories.json.secrets_repository.APP_SECRETS_PATH", secrets_path)
    monkeypatch.setattr("backend.config.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.services.secrets_service.API_ENV_FILE", env_file)
    monkeypatch.setattr("backend.config.STORAGE_BACKEND", "json")
    monkeypatch.setattr("backend.repositories.factory.STORAGE_BACKEND", "json")
    monkeypatch.delenv("MODELSCOPE_API_KEY", raising=False)
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    reset_repositories()

    imported = secrets_service.migrate_env_secrets_into_store()
    assert imported == 2
    assert secrets_service.get_secret("MODELSCOPE_API_KEY") == "from-env-file"
    assert secrets_service.get_secret("ARK_API_KEY") == "volc-env"

    # Second run does not overwrite existing store values
    env_file.write_text('MODELSCOPE_API_KEY="should-not-win"\n', encoding="utf-8")
    assert secrets_service.migrate_env_secrets_into_store() == 0
    assert secrets_service.get_secret("MODELSCOPE_API_KEY") == "from-env-file"
    reset_repositories()


def test_sqlite_secrets_repository(tmp_path, monkeypatch):
    from backend.config import MIGRATIONS_DIR
    from backend.repositories.sqlite.secrets_repository import SqliteSecretsRepository
    from backend.storage.migration_runner import ensure_schema_current

    db_path = tmp_path / "secrets.db"
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    repo = SqliteSecretsRepository(db_path)
    repo.set_many({"RUNNINGHUB_API_KEY": "rh-db-key", "MODELSCOPE_API_KEY": "ms"})
    assert repo.get("RUNNINGHUB_API_KEY") == "rh-db-key"
    repo.set_many({"RUNNINGHUB_API_KEY": ""})
    assert repo.get("RUNNINGHUB_API_KEY") is None
    assert repo.load_all() == {"MODELSCOPE_API_KEY": "ms"}
