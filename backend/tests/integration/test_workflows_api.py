SAMPLE_WORKFLOW = {
    "1": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
}


def test_upload_list_get_delete_workflow(workflow_client):
    uploaded = workflow_client.post(
        "/api/workflows",
        json={"name": "test-flow.json", "workflow": SAMPLE_WORKFLOW},
    )
    assert uploaded.status_code == 200
    name = uploaded.json()["name"]
    listing = workflow_client.get("/api/workflows").json()
    assert any(w["name"] == name for w in listing["workflows"])
    detail = workflow_client.get(f"/api/workflows/{name}").json()
    assert detail["workflow"]["1"]["class_type"] == "EmptyLatentImage"
    saved = workflow_client.put(
        f"/api/workflows/{name}/config",
        json={"title": "测试", "fields": []},
    )
    assert saved.status_code == 200
    deleted = workflow_client.delete(f"/api/workflows/{name}")
    assert deleted.status_code == 200


def test_run_workflow_mock(workflow_client, monkeypatch):
    workflow_client.post("/api/workflows", json={"name": "run-test.json", "workflow": SAMPLE_WORKFLOW})
    name = "custom/run-test.json"

    def fake_comfy(req):
        return {"ok": True, "task_id": 1, "workflow": req.workflow_json, "params": req.params}

    monkeypatch.setattr("backend.services.comfy_generate_service.comfy_generate", fake_comfy)
    response = workflow_client.post(
        f"/api/workflows/{name}/run",
        json={
            "fields": {"seed": "42"},
            "config": {
                "title": "t",
                "fields": [{"id": "seed", "node": "1", "input": "seed", "type": "number"}],
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("ok") is True
    assert payload.get("workflow") == name
    assert payload["params"]["1"]["seed"] == 42


def test_run_workflow_not_found(workflow_client):
    response = workflow_client.post(
        "/api/workflows/custom/missing.json/run",
        json={"fields": {}, "config": {"title": "t", "fields": []}},
    )
    assert response.status_code == 404
