from pathlib import Path


def test_storage_stats_api(client):
    response = client.get("/api/storage/stats")
    assert response.status_code == 200
    payload = response.json()
    assert "object_count" in payload
    assert "storage_backend" in payload


def test_storage_orphans_api(client):
    response = client.get("/api/storage/orphans")
    assert response.status_code == 200
    payload = response.json()
    assert "orphan_count" in payload


def test_storage_backup_api(client, tmp_path, monkeypatch):
    from backend.config import MIGRATIONS_DIR
    from backend.storage.migration_runner import ensure_schema_current

    data_dir = tmp_path / "data"
    objects_dir = data_dir / "objects"
    db_path = data_dir / "infinite-canvas.db"
    data_dir.mkdir()
    (objects_dir / "input").mkdir(parents=True)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    monkeypatch.setattr("backend.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)
    response = client.post("/api/storage/backup")
    assert response.status_code == 200
    assert response.json().get("ok") is True


def test_storage_backups_list_api(client, tmp_path, monkeypatch):
    from backend.config import MIGRATIONS_DIR
    from backend.storage.migration_runner import ensure_schema_current

    data_dir = tmp_path / "data"
    objects_dir = data_dir / "objects"
    db_path = data_dir / "infinite-canvas.db"
    data_dir.mkdir()
    (objects_dir / "input").mkdir(parents=True)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    monkeypatch.setattr("backend.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)

    create_resp = client.post("/api/storage/backup")
    assert create_resp.status_code == 200
    backup_dir = create_resp.json()["backup_dir"]

    list_resp = client.get("/api/storage/backups")
    assert list_resp.status_code == 200
    backups = list_resp.json()["backups"]
    assert len(backups) >= 1
    assert backups[0]["backup_dir"] == backup_dir


def test_storage_restore_api(client, tmp_path, monkeypatch):
    from backend.config import MIGRATIONS_DIR
    from backend.storage.migration_runner import ensure_schema_current

    data_dir = tmp_path / "data"
    objects_dir = data_dir / "objects"
    db_path = data_dir / "infinite-canvas.db"
    data_dir.mkdir()
    (objects_dir / "input").mkdir(parents=True)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    marker = objects_dir / "input" / "marker.bin"
    marker.write_bytes(b"v1")
    monkeypatch.setattr("backend.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.config.DATABASE_PATH", db_path)
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)
    monkeypatch.setattr(
        "backend.storage.orphan_scanner.collect_referenced_object_keys",
        lambda data_dir=None: set(),
    )

    create_resp = client.post("/api/storage/backup")
    backup_dir = create_resp.json()["backup_dir"]
    marker.write_bytes(b"v2")

    restore_resp = client.post("/api/storage/restore", json={"backup_dir": backup_dir})
    assert restore_resp.status_code == 200
    assert restore_resp.json().get("ok") is True
    assert marker.read_bytes() == b"v1"


def test_storage_restore_rejects_outside_backups(client, tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr("backend.config.DATA_DIR", data_dir)
    response = client.post("/api/storage/restore", json={"backup_dir": str(tmp_path / "evil")})
    assert response.status_code == 400
