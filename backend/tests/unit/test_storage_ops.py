import sqlite3
from pathlib import Path

from backend.services.object_store_media import asset_url_for_key
from backend.storage.backup_service import (
    create_full_backup,
    list_backups,
    restore_full_backup,
    resolve_backup_dir,
    storage_stats,
)
from backend.storage.orphan_scanner import collect_referenced_object_keys, list_object_keys, scan_orphan_objects


def test_list_object_keys(tmp_path):
    root = tmp_path / "objects"
    (root / "input").mkdir(parents=True)
    (root / "input" / "a.png").write_bytes(b"x")
    keys = list_object_keys(root)
    assert keys == ["input/a.png"]


def test_orphan_scan_detects_unreferenced(tmp_path, monkeypatch):
    objects_dir = tmp_path / "objects"
    (objects_dir / "output").mkdir(parents=True)
    (objects_dir / "output" / "orphan.png").write_bytes(b"x")
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr("backend.storage.orphan_scanner.collect_referenced_object_keys", lambda data_dir=None: set())
    report = scan_orphan_objects(objects_root=objects_dir, data_dir=data_dir)
    assert report["orphan_count"] == 1
    assert report["orphan_keys"] == ["output/orphan.png"]


def test_collect_referenced_from_asset_library(tmp_path, monkeypatch):
    objects_dir = tmp_path / "objects"
    (objects_dir / "library").mkdir(parents=True)
    (objects_dir / "library" / "used.png").write_bytes(b"x")
    url = asset_url_for_key("library/used.png")
    lib = {"libraries": [{"id": "default", "categories": [{"items": [{"url": url}]}]}]}
    monkeypatch.setattr(
        "backend.services.asset_library_service.load_asset_library",
        lambda: lib,
    )
    keys = collect_referenced_object_keys(tmp_path / "data")
    assert "library/used.png" in keys


def test_storage_stats_and_backup(tmp_path, monkeypatch):
    from backend.config import MIGRATIONS_DIR
    from backend.storage.migration_runner import ensure_schema_current

    data_dir = tmp_path / "data"
    db_path = data_dir / "infinite-canvas.db"
    objects_dir = data_dir / "objects"
    data_dir.mkdir()
    (objects_dir / "input").mkdir(parents=True)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    (objects_dir / "input" / "f.bin").write_bytes(b"1234")
    monkeypatch.setattr("backend.storage.orphan_scanner.collect_referenced_object_keys", lambda data_dir=None: set())
    stats = storage_stats(data_dir=data_dir, db_path=db_path, objects_dir=objects_dir)
    assert stats["object_count"] == 1
    assert stats["database_bytes"] > 0
    result = create_full_backup(data_dir=data_dir, db_path=db_path, objects_dir=objects_dir)
    assert result["ok"] is True
    backup_dir = tmp_path / "data" / "backups"
    assert any(backup_dir.iterdir())


def test_list_backups_and_restore(tmp_path, monkeypatch):
    from backend.config import MIGRATIONS_DIR
    from backend.storage.migration_runner import ensure_schema_current

    data_dir = tmp_path / "data"
    db_path = data_dir / "infinite-canvas.db"
    objects_dir = data_dir / "objects"
    data_dir.mkdir()
    (objects_dir / "input").mkdir(parents=True)
    ensure_schema_current(db_path, MIGRATIONS_DIR)
    marker = objects_dir / "input" / "marker.bin"
    marker.write_bytes(b"v1")
    monkeypatch.setattr("backend.storage.orphan_scanner.collect_referenced_object_keys", lambda data_dir=None: set())

    created = create_full_backup(data_dir=data_dir, db_path=db_path, objects_dir=objects_dir)
    backup_path = Path(created["backup_dir"])
    backups = list_backups(data_dir=data_dir)
    assert len(backups) == 1
    assert backups[0]["name"] == backup_path.name

    marker.write_bytes(b"v2-changed")
    resolved = resolve_backup_dir(str(backup_path), data_dir=data_dir)
    result = restore_full_backup(
        backup_dir=resolved,
        data_dir=data_dir,
        db_path=db_path,
        objects_dir=objects_dir,
    )
    assert result["ok"] is True
    assert marker.read_bytes() == b"v1"
    assert result.get("safety_backup_dir")
