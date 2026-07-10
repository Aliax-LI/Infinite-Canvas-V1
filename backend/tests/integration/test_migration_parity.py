"""Verify backend migration matches MIGRATION_PLAN.md contracts."""

from fastapi.routing import APIRoute

MIGRATED_ROUTES = {
    ("GET", "/api/app-info"),
    ("GET", "/api/check-update"),
    ("POST", "/api/update-from-github"),
    ("GET", "/api/canvases"),
    ("GET", "/api/canvases/trash"),
    ("POST", "/api/canvases"),
    ("GET", "/api/canvases/{canvas_id}/meta"),
    ("POST", "/api/canvases/{canvas_id}/meta"),
    ("GET", "/api/canvases/{canvas_id}"),
    ("POST", "/api/canvases/{canvas_id}/touch"),
    ("PUT", "/api/canvases/{canvas_id}"),
    ("DELETE", "/api/canvases/{canvas_id}"),
    ("POST", "/api/canvases/{canvas_id}/restore"),
    ("DELETE", "/api/canvases/{canvas_id}/purge"),
    ("GET", "/api/projects"),
    ("POST", "/api/projects"),
    ("POST", "/api/projects/{project_id}"),
    ("DELETE", "/api/projects/{project_id}"),
    ("GET", "/api/canvas-assets"),
    ("GET", "/api/smart-canvas/prompt-templates"),
    ("POST", "/api/smart-canvas/group-export"),
    ("POST", "/api/canvas-assets/check"),
    ("POST", "/api/canvas-assets/download"),

    ("GET", "/api/media-preview"),
    ("GET", "/api/image-jpeg"),
    ("GET", "/api/view"),
    ("GET", "/api/download-output"),
    ("POST", "/api/upload"),
    ("POST", "/api/ai/upload"),
    ("POST", "/api/ai/upload-base64"),
    ("POST", "/api/comfyui/upload-base64"),

    ("GET", "/api/asset-library"),
    ("GET", "/api/local-assets"),
    ("POST", "/api/local-assets/upload"),
    ("POST", "/api/local-assets/import-urls"),
    ("POST", "/api/local-assets/folders"),
    ("PATCH", "/api/local-assets/folders"),
    ("PATCH", "/api/local-assets/items"),
    ("POST", "/api/local-assets/delete"),
    ("POST", "/api/local-assets/move"),
    ("POST", "/api/local-assets/caption"),
    ("POST", "/api/local-assets/classify"),
    ("PATCH", "/api/local-assets/caption"),
    ("POST", "/api/ai/import-local-image"),

    ("POST", "/api/asset-library/libraries"),
    ("PATCH", "/api/asset-library/libraries/{library_id}"),
    ("DELETE", "/api/asset-library/libraries/{library_id}"),
    ("POST", "/api/asset-library/categories"),
    ("PATCH", "/api/asset-library/categories/{category_id}"),
    ("DELETE", "/api/asset-library/categories/{category_id}"),
    ("POST", "/api/asset-library/items"),
    ("POST", "/api/asset-library/items/batch"),
    ("PATCH", "/api/asset-library/items/{item_id}"),
    ("DELETE", "/api/asset-library/items/{item_id}"),
    ("POST", "/api/asset-library/items/delete"),
    ("POST", "/api/asset-library/items/move"),
    ("POST", "/api/asset-library/items/crop"),
    ("POST", "/api/asset-library/items/classify"),
    ("POST", "/api/asset-library/items/{item_id}/register-avatar"),
    ("POST", "/api/asset-library/items/{item_id}/avatar-status"),
    ("POST", "/api/asset-library/workflows/upload"),

    ("GET", "/api/prompt-libraries"),
    ("POST", "/api/prompt-libraries"),
    ("PATCH", "/api/prompt-libraries/{library_id}"),
    ("DELETE", "/api/prompt-libraries/{library_id}"),
    ("POST", "/api/prompt-libraries/items"),
    ("PATCH", "/api/prompt-libraries/items/{item_id}"),
    ("DELETE", "/api/prompt-libraries/items/{item_id}"),
    ("POST", "/api/prompt-libraries/items/delete"),
    ("POST", "/api/prompt-libraries/categories"),
    ("PATCH", "/api/prompt-libraries/categories/{category_id}"),
    ("DELETE", "/api/prompt-libraries/categories/{category_id}"),
    ("GET", "/api/shared-folders"),
    ("POST", "/api/shared-folders"),
    ("DELETE", "/api/shared-folders/{folder_id}"),
    ("GET", "/api/shared-folders/{folder_id}/tree"),
    ("GET", "/api/shared-folders/{folder_id}/file"),
    ("POST", "/api/shared-folders/import"),

    ("GET", "/api/comfyui/instances"),
    ("PUT", "/api/comfyui/instances"),
    ("GET", "/api/workflows"),
    ("GET", "/api/workflows/{name:path}"),
    ("POST", "/api/workflows"),
    ("PUT", "/api/workflows/{name:path}/config"),
    ("DELETE", "/api/workflows/{name:path}"),
    ("POST", "/api/workflows/{name:path}/run"),

    ("GET", "/api/runninghub/app-info"),
    ("POST", "/api/runninghub/submit"),
    ("POST", "/api/runninghub/workflow-submit"),
    ("GET", "/api/runninghub/workflow-info"),
    ("GET", "/api/runninghub/workflows"),
    ("GET", "/api/runninghub/workflows/{workflow_id:path}"),
    ("POST", "/api/runninghub/workflows/fetch"),
    ("PUT", "/api/runninghub/workflows/{workflow_id:path}"),
    ("DELETE", "/api/runninghub/workflows/{workflow_id:path}"),
    ("GET", "/api/runninghub/query"),
    ("POST", "/api/runninghub/upload-asset"),

    ("POST", "/api/canvas-workflows/export"),
    ("POST", "/api/canvas-workflows/export-to-library"),
    ("POST", "/api/canvas-workflows/import"),

    ("GET", "/api/config"),
    ("GET", "/api/models"),
    ("GET", "/api/config/token"),
    ("GET", "/api/providers"),
    ("PUT", "/api/providers"),
    ("POST", "/api/providers/test-connection"),
    ("POST", "/api/providers/probe-async"),
    ("POST", "/api/providers/fetch-models"),
    ("GET", "/api/providers/{provider_id}/fetch-models"),

    ("GET", "/api/codex/status"),
    ("POST", "/api/codex/install-image-helper"),
    ("POST", "/api/codex/help"),
    ("GET", "/api/gemini-cli/status"),
    ("POST", "/api/gemini-cli/help"),
    ("GET", "/api/jimeng/status"),
    ("GET", "/api/jimeng/credit"),
    ("POST", "/api/jimeng/logout"),
    ("POST", "/api/jimeng/login/start"),
    ("GET", "/api/jimeng/login/status"),
    ("POST", "/api/jimeng/help"),
    ("POST", "/api/jimeng/query-media"),

    ("GET", "/api/image-params"),
    ("POST", "/api/online-image"),
    ("POST", "/api/image-task-query"),
    ("POST", "/api/canvas-image-tasks"),
    ("GET", "/api/canvas-image-tasks/{task_id}"),
    ("POST", "/api/canvas-comfy-tasks"),
    ("GET", "/api/canvas-comfy-tasks/{task_id}"),
    ("POST", "/api/canvas-video"),
    ("POST", "/api/canvas-llm"),
    ("POST", "/api/temp-sh/upload"),
    ("POST", "/api/cloud-video/upload"),
    ("GET", "/api/conversations"),
    ("POST", "/api/conversations"),
    ("GET", "/api/conversations/{conversation_id}"),
    ("DELETE", "/api/conversations/{conversation_id}"),

    ("POST", "/api/chat"),
    ("POST", "/api/chat/agent"),
    ("POST", "/api/chat/stream"),
    ("GET", "/api/history"),
    ("GET", "/api/queue_status"),
    ("POST", "/api/history/delete"),
    ("POST", "/api/angle/poll_status"),
    ("POST", "/api/angle/generate"),
    ("POST", "/api/ms/generate"),
    ("POST", "/api/generate"),
}

DEPRECATED_ROUTES = {
    ("GET", "/api/update-connectivity"),
    ("GET", "/api/update-connectivity/probe"),
    ("GET", "/api/update-backups"),
    ("POST", "/api/update-rollback"),
}

PLAN_APP_INFO_KEYS = {"version", "desktop_build_id", "is_electron", "repo_url", "release_url"}
PLAN_CHECK_UPDATE_KEYS = {"current", "latest", "update_available", "desktop_build_id"}


def _route_keys(app):
    keys = set()
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                if method != "HEAD":
                    keys.add((method, route.path))
    return keys


def test_migrated_routes_are_registered(client):
    from backend.main import app

    registered = _route_keys(app)
    missing = MIGRATED_ROUTES - registered
    assert not missing, f"Missing migrated routes: {sorted(missing)}"


def test_deprecated_hot_update_routes_return_404(client):
    for method, path in DEPRECATED_ROUTES:
        if method == "GET":
            response = client.get(path)
        else:
            response = client.post(path, json={})
        assert response.status_code == 404, f"{method} {path} should be 404"


def test_app_info_matches_plan_shape(client):
    payload = client.get("/api/app-info").json()
    assert PLAN_APP_INFO_KEYS.issubset(payload.keys())
    assert payload["is_electron"] is True
    assert payload["release_url"].endswith("/releases")


def test_check_update_matches_plan_shape(client, monkeypatch):
    from backend.services import versioning

    monkeypatch.setattr(versioning, "fetch_github_latest_release", lambda timeout=5.0: {"ok": False, "error": "offline"})
    payload = client.get("/api/check-update").json()
    assert PLAN_CHECK_UPDATE_KEYS.issubset(payload.keys())


def test_smart_canvas_kind_defaults(canvas_client):
    smart = canvas_client.post("/api/canvases", json={"title": "智能", "kind": "smart"}).json()["canvas"]
    classic = canvas_client.post("/api/canvases", json={"title": "普通", "kind": "classic"}).json()["canvas"]
    assert smart["kind"] == "smart"
    assert classic["kind"] == "classic"
    # Pydantic 默认 icon="🧩"，与 legacy CanvasCreateRequest 一致
    assert smart["icon"] == "🧩"


def test_canvas_assets_index_shape(canvas_client):
    create = canvas_client.post(
        "/api/canvases",
        json={
            "title": "资产测试",
            "kind": "smart",
        },
    )
    canvas_id = create.json()["canvas"]["id"]
    canvas_client.put(
        f"/api/canvases/{canvas_id}",
        json={
            "title": "资产测试",
            "nodes": [
                {
                    "id": "n1",
                    "type": "image",
                    "title": "图",
                    "url": "https://example.com/a.png",
                }
            ],
            "connections": [],
        },
    )
    index = canvas_client.get("/api/canvas-assets").json()
    assert {"categories", "canvases", "items"}.issubset(index.keys())
    assert any(item["canvas_id"] == canvas_id for item in index["items"])


def test_prompt_templates_endpoint(canvas_client):
    response = canvas_client.get("/api/smart-canvas/prompt-templates")
    assert response.status_code == 200
    payload = response.json()
    assert "templates" in payload
    assert isinstance(payload["templates"], list)


def test_canvas_assets_check(canvas_client):
    response = canvas_client.post(
        "/api/canvas-assets/check",
        json={"urls": ["https://example.com/x.png", "/output/missing.png"]},
    )
    assert response.status_code == 200
    exists = response.json()["exists"]
    assert exists["https://example.com/x.png"] is True
    assert exists["/output/missing.png"] is False
