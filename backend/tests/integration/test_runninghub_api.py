def test_runninghub_workflow_crud(runninghub_client):
    saved = runninghub_client.put(
        "/api/runninghub/workflows/wf_test_001",
        json={"workflowId": "wf_test_001", "title": "测试工作流", "description": "desc", "fields": [], "workflowJson": {"1": {"class_type": "EmptyLatentImage", "inputs": {}}}},
    )
    assert saved.status_code == 200
    listing = runninghub_client.get("/api/runninghub/workflows").json()
    assert any(w["workflowId"] == "wf_test_001" for w in listing["workflows"])
    detail = runninghub_client.get("/api/runninghub/workflows/wf_test_001").json()
    assert detail["workflow"]["title"] == "测试工作流"
    deleted = runninghub_client.delete("/api/runninghub/workflows/wf_test_001")
    assert deleted.status_code == 200


def test_runninghub_submit_requires_api_key(runninghub_client):
    response = runninghub_client.post(
        "/api/runninghub/submit",
        json={"webappId": "123", "nodeInfoList": []},
    )
    assert response.status_code == 400
