from PIL import Image


def _write_png(path):
    Image.new("RGB", (4, 4), color=(1, 2, 3)).save(path, format="PNG")


def test_register_and_list_shared_folder(shared_folders_client, tmp_path):
    media_dir = tmp_path / "shared_media"
    media_dir.mkdir()
    _write_png(media_dir / "a.png")
    registered = shared_folders_client.post(
        "/api/shared-folders",
        json={"path": "shared_media", "name": "测试共享"},
    ).json()
    folder_id = registered["folder"]["id"]
    listing = shared_folders_client.get("/api/shared-folders").json()
    assert any(f["id"] == folder_id for f in listing["folders"])
    tree = shared_folders_client.get(f"/api/shared-folders/{folder_id}/tree").json()
    assert tree["tree"]["items"]
