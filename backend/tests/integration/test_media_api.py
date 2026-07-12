import base64
from pathlib import Path

import pytest
from PIL import Image


def _write_png(path):
    img = Image.new("RGB", (8, 8), color=(255, 0, 0))
    img.save(path, format="PNG")


def test_upload_comfy_with_files_field(media_client, monkeypatch):
    from PIL import Image
    import io

    monkeypatch.setattr(
        "backend.routers.media.upload_image_to_comfyui",
        lambda filename, content, content_type: filename,
    )
    img = Image.new("RGB", (8, 8), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    response = media_client.post(
        "/api/upload",
        files={"files": ("sample.png", data, "image/png")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["files"] == [{"comfy_name": "sample.png"}]


def test_upload_comfy_accepts_legacy_file_field(media_client, monkeypatch):
    from PIL import Image
    import io

    monkeypatch.setattr(
        "backend.routers.media.upload_image_to_comfyui",
        lambda filename, content, content_type: filename,
    )
    img = Image.new("RGB", (8, 8), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    response = media_client.post(
        "/api/upload",
        files={"file": ("legacy.png", data, "image/png")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["files"] == [{"comfy_name": "legacy.png"}]


def test_upload_comfy_missing_files_returns_422(media_client):
    response = media_client.post("/api/upload", data={})
    assert response.status_code == 422
    assert "No files uploaded" in response.json()["detail"]


def test_upload_comfy_wrong_content_type_returns_422(media_client):
    response = media_client.post(
        "/api/upload",
        content=b"{}",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "No files uploaded" in response.json()["detail"]


def test_ai_upload_saves_local_file(media_client, tmp_path, monkeypatch):
    from backend.config import OBJECTS_DIR

    png = tmp_path / "sample.png"
    _write_png(png)
    with open(png, "rb") as f:
        response = media_client.post(
            "/api/ai/upload",
            files={"files": ("sample.png", f.read(), "image/png")},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["files"]
    file_info = payload["files"][0]
    assert file_info["url"].startswith("/assets/input/")
    assert file_info["kind"] == "image"
    saved = list((OBJECTS_DIR / "input").glob("ai_ref_*"))
    assert saved


def test_ai_upload_base64(media_client):
    tiny_png = base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeb`\x82"
    ).decode()
    response = media_client.post(
        "/api/ai/upload-base64",
        json={"data": tiny_png, "name": "dot.png", "content_type": "image/png"},
    )
    assert response.status_code == 200
    assert response.json()["files"][0]["url"].startswith("/assets/input/")


def test_download_output_local(media_client, tmp_path, monkeypatch):
    from backend.config import OUTPUT_OUTPUT_DIR
    from backend.services.media_paths import output_url_for

    filename = "local_test.png"
    _write_png(OUTPUT_OUTPUT_DIR / filename)
    url = output_url_for(filename, "output")
    response = media_client.get("/api/download-output", params={"url": url})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/")


def test_view_local_fallback(media_client, tmp_path):
    from backend.services.media_paths import output_path_for

    filename = "view_test.png"
    _write_png(Path(output_path_for(filename, "input")))
    response = media_client.get("/api/view", params={"filename": filename, "type": "input"})
    assert response.status_code == 200


def test_media_preview_local(media_client, tmp_path):
    from backend.config import OUTPUT_OUTPUT_DIR
    from backend.services.media_paths import output_url_for

    filename = "preview_test.png"
    _write_png(OUTPUT_OUTPUT_DIR / filename)
    url = output_url_for(filename, "output")
    response = media_client.get("/api/media-preview", params={"url": url, "w": 64})
    assert response.status_code == 200
    assert response.headers["content-type"] in {"image/webp", "image/png"}


def test_media_preview_missing_returns_404(media_client):
    response = media_client.get("/api/media-preview", params={"url": "/assets/output/missing.png"})
    assert response.status_code == 404
