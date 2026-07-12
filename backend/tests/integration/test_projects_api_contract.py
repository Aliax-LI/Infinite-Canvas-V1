"""API contract baseline for /api/projects — freeze response shape before SQLite migration."""

PROJECT_FIELDS = {"id", "name", "order", "created_at", "updated_at", "canvas_count"}


def test_list_projects_response_shape(canvas_client):
    response = canvas_client.get("/api/projects")
    assert response.status_code == 200
    body = response.json()
    assert "projects" in body
    assert isinstance(body["projects"], list)
    default = next((p for p in body["projects"] if p["id"] == "default"), None)
    assert default is not None
    assert PROJECT_FIELDS.issubset(set(default.keys()))


def test_create_project_response_shape(canvas_client):
    response = canvas_client.post("/api/projects", json={"name": "契约测试项目"})
    assert response.status_code == 200
    body = response.json()
    assert "project" in body
    project = body["project"]
    assert {"id", "name", "order", "created_at", "updated_at"}.issubset(set(project.keys()))
    assert project["name"] == "契约测试项目"


def test_update_project_response_shape(canvas_client):
    created = canvas_client.post("/api/projects", json={"name": "待更新"})
    project_id = created.json()["project"]["id"]
    response = canvas_client.post(f"/api/projects/{project_id}", json={"name": "已更新", "order": 99})
    assert response.status_code == 200
    project = response.json()["project"]
    assert project["name"] == "已更新"
    assert project["order"] == 99


def test_delete_project_response_shape(canvas_client):
    created = canvas_client.post("/api/projects", json={"name": "待删除"})
    project_id = created.json()["project"]["id"]
    response = canvas_client.delete(f"/api/projects/{project_id}")
    assert response.status_code == 200
    body = response.json()
    assert body.get("ok") is True
    assert "moved" in body
