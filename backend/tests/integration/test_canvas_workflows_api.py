import json
import zipfile
from io import BytesIO

from PIL import Image


def _write_png(path):
    Image.new("RGB", (4, 4), color=(1, 2, 3)).save(path, format="PNG")


def test_export_and_import_canvas_workflow(canvas_workflow_client, tmp_path):
    from backend.config import OUTPUT_INPUT_DIR

    png = OUTPUT_INPUT_DIR / "wf_node.png"
    _write_png(png)
    nodes = [{"id": "n1", "type": "image", "url": "/assets/input/wf_node.png"}]
    exported = canvas_workflow_client.post(
        "/api/canvas-workflows/export",
        json={"nodes": nodes, "connections": [], "include_resources": True},
    )
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/zip")
    imported = canvas_workflow_client.post(
        "/api/canvas-workflows/import",
        files={"file": ("workflow.zip", exported.content, "application/zip")},
    )
    assert imported.status_code == 200
    payload = imported.json()
    assert payload["nodes"][0]["url"].startswith("/assets/")


def test_import_json_workflow(canvas_workflow_client):
    raw = json.dumps({"nodes": [{"id": "a", "type": "text", "text": "hi"}], "connections": []}).encode()
    response = canvas_workflow_client.post(
        "/api/canvas-workflows/import",
        files={"file": ("workflow.json", raw, "application/json")},
    )
    assert response.status_code == 200
    assert response.json()["nodes"][0]["id"] == "a"
