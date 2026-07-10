def test_smart_canvas_group_export_text(media_client, tmp_path, monkeypatch):
    from backend.config import OUTPUT_DIR

    export_root = tmp_path / "smart-export"
    export_root.mkdir()
    monkeypatch.setattr("backend.services.smart_canvas_service.OUTPUT_DIR", export_root)
    monkeypatch.setattr("backend.config.OUTPUT_DIR", export_root)

    response = media_client.post(
        "/api/smart-canvas/group-export",
        json={
            "group_name": "测试组",
            "items": [
                {"kind": "text", "text": "hello world", "name": "note.txt"},
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["count"] == 1
    assert (export_root / "smart-groups").exists() or payload["folder"]
