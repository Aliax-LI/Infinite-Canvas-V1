from backend.services.media_paths import output_storage
from backend.services.object_store_media import asset_url_for_key, object_key_from_asset_url, put_asset_bytes
from backend.storage.object_store_factory import get_object_store, reset_object_store


def test_object_key_roundtrip():
    key = "input/ai_ref_abc.png"
    url = asset_url_for_key(key)
    assert object_key_from_asset_url(url) == key


def test_put_asset_bytes_stores_under_objects_dir(tmp_path, monkeypatch):
    objects_dir = tmp_path / "objects"
    objects_dir.mkdir()
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)
    reset_object_store()
    stored = put_asset_bytes(b"hello", category="input", filename="test.txt", content_type="text/plain")
    assert stored.url == "/assets/input/test.txt"
    assert (objects_dir / "input" / "test.txt").is_file()
    assert get_object_store().exists("input/test.txt")


def test_output_storage_uses_object_store_root(tmp_path, monkeypatch):
    objects_dir = tmp_path / "objects"
    objects_dir.mkdir()
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)
    reset_object_store()
    folder, subdir = output_storage("output")
    assert subdir == "output"
    assert folder == str(objects_dir / "output")
    assert (objects_dir / "output").is_dir()


def test_serve_asset_from_object_store(client, tmp_path, monkeypatch):
    objects_dir = tmp_path / "objects"
    (objects_dir / "output").mkdir(parents=True)
    png = objects_dir / "output" / "serve_test.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr("backend.config.OBJECTS_DIR", objects_dir)
    reset_object_store()
    response = client.get("/assets/output/serve_test.png")
    assert response.status_code == 200
