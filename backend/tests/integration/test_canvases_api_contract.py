"""API contract baseline for /api/canvases — freeze response shape before SQLite migration."""

CANVAS_LIST_FIELDS = {
    "id", "title", "icon", "kind", "owner", "color", "pinned", "project",
    "created_at", "updated_at", "deleted_at", "node_count",
}

CANVAS_DETAIL_FIELDS = {
    "id", "title", "icon", "kind", "owner", "color", "pinned", "project",
    "created_at", "updated_at", "nodes", "connections", "viewport",
}


def test_list_canvases_response_shape(canvas_client):
    response = canvas_client.get("/api/canvases")
    assert response.status_code == 200
    body = response.json()
    assert "canvases" in body
    assert isinstance(body["canvases"], list)


def test_create_canvas_response_shape(canvas_client):
    response = canvas_client.post("/api/canvases", json={"title": "契约画布", "kind": "classic"})
    assert response.status_code == 200
    canvas = response.json()["canvas"]
    assert canvas["title"] == "契约画布"
    assert CANVAS_DETAIL_FIELDS.issubset(set(canvas.keys()))


def test_get_canvas_response_shape(canvas_client):
    created = canvas_client.post("/api/canvases", json={"title": "详情测试"})
    canvas_id = created.json()["canvas"]["id"]
    response = canvas_client.get(f"/api/canvases/{canvas_id}")
    assert response.status_code == 200
    canvas = response.json()["canvas"]
    assert "nodes" in canvas
    assert "connections" in canvas
    assert canvas["title"] == "详情测试"
