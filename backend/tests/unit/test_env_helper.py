import os

from backend.services import env_helper


def test_load_env_file_restores_persisted_keys(tmp_path, monkeypatch):
    env_file = tmp_path / "config" / "api.env"
    env_file.parent.mkdir(parents=True)
    env_file.write_text('MODELSCOPE_API_KEY="persisted-ms-key"\nARK_API_KEY=volc-ark-key\n', encoding="utf-8")

    monkeypatch.setattr(env_helper, "API_ENV_FILE", env_file)
    monkeypatch.delenv("MODELSCOPE_API_KEY", raising=False)
    monkeypatch.delenv("ARK_API_KEY", raising=False)

    env_helper.load_env_file()

    assert os.getenv("MODELSCOPE_API_KEY") == "persisted-ms-key"
    assert os.getenv("ARK_API_KEY") == "volc-ark-key"


def test_update_env_values_writes_and_load_roundtrip(tmp_path, monkeypatch):
    env_file = tmp_path / "config" / "api.env"
    env_file.parent.mkdir(parents=True)
    monkeypatch.setattr(env_helper, "API_ENV_FILE", env_file)
    monkeypatch.delenv("RUNNINGHUB_API_KEY", raising=False)

    env_helper.update_env_values({"RUNNINGHUB_API_KEY": "rh-secret-123"})
    assert env_file.is_file()
    assert "RUNNINGHUB_API_KEY" in env_file.read_text(encoding="utf-8")

    monkeypatch.delenv("RUNNINGHUB_API_KEY", raising=False)
    env_helper.load_env_file()
    assert os.getenv("RUNNINGHUB_API_KEY") == "rh-secret-123"
