import pytest



def test_create_and_list_canvas(canvas_client):
    create = canvas_client.post("/api/canvases", json={"title": "测试画布", "kind": "smart"})
    assert create.status_code == 200
    canvas = create.json()["canvas"]
    assert canvas["title"] == "测试画布"
    assert canvas["kind"] == "smart"
    assert canvas["id"]

    listing = canvas_client.get("/api/canvases")
    assert listing.status_code == 200
    ids = [item["id"] for item in listing.json()["canvases"]]
    assert canvas["id"] in ids


def test_get_update_and_delete_canvas(canvas_client):
    create = canvas_client.post("/api/canvases", json={"title": "原始标题"})
    canvas_id = create.json()["canvas"]["id"]

    fetched = canvas_client.get(f"/api/canvases/{canvas_id}")
    assert fetched.status_code == 200
    assert fetched.json()["canvas"]["title"] == "原始标题"

    updated = canvas_client.put(
        f"/api/canvases/{canvas_id}",
        json={
            "title": "更新标题",
            "nodes": [{"id": "n1", "type": "text"}],
            "connections": [],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["canvas"]["title"] == "更新标题"
    assert len(updated.json()["canvas"]["nodes"]) == 1

    deleted = canvas_client.delete(f"/api/canvases/{canvas_id}")
    assert deleted.status_code == 200

    trash = canvas_client.get("/api/canvases/trash")
    assert any(item["id"] == canvas_id for item in trash.json()["canvases"])

    restored = canvas_client.post(f"/api/canvases/{canvas_id}/restore")
    assert restored.status_code == 200
    assert restored.json()["canvas"]["id"] == canvas_id


def test_projects_crud(canvas_client):
    projects = canvas_client.get("/api/projects")
    assert projects.status_code == 200
    assert any(p["id"] == "default" for p in projects.json()["projects"])

    created = canvas_client.post("/api/projects", json={"name": "测试项目"})
    assert created.status_code == 200
    project_id = created.json()["project"]["id"]

    renamed = canvas_client.post(f"/api/projects/{project_id}", json={"name": "重命名项目"})
    assert renamed.status_code == 200
    assert renamed.json()["project"]["name"] == "重命名项目"
