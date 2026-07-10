def test_get_comfyui_instances(comfyui_client):
    response = comfyui_client.get("/api/comfyui/instances")
    assert response.status_code == 200
    assert isinstance(response.json()["instances"], list)


def test_save_comfyui_instances(comfyui_client):
    response = comfyui_client.put(
        "/api/comfyui/instances",
        json={"instances": ["127.0.0.1:8188", "127.0.0.1:8189"]},
    )
    assert response.status_code == 200
    assert response.json()["instances"] == ["127.0.0.1:8188", "127.0.0.1:8189"]


def test_comfyui_status_endpoint(comfyui_client, monkeypatch):
    def fake_probe(instances=None):
        targets = instances or ["127.0.0.1:8188"]
        return {
            "instances": [{"address": targets[0], "online": True, "latency_ms": 12}],
            "online_count": 1,
            "total": len(targets),
        }

    monkeypatch.setattr("backend.services.comfyui_client.probe_comfyui_instances", fake_probe)
    response = comfyui_client.get("/api/comfyui/status")
    assert response.status_code == 200
    body = response.json()
    assert body["online_count"] == 1
    assert body["instances"][0]["online"] is True


def test_comfyui_status_with_query_instances(comfyui_client, monkeypatch):
    captured: list[list[str] | None] = []

    def fake_probe(instances=None):
        captured.append(instances)
        return {"instances": [], "online_count": 0, "total": 0}

    monkeypatch.setattr("backend.services.comfyui_client.probe_comfyui_instances", fake_probe)
    response = comfyui_client.get("/api/comfyui/status", params={"instances": "10.0.0.1:8188,127.0.0.1:8189"})
    assert response.status_code == 200
    assert captured == [["10.0.0.1:8188", "127.0.0.1:8189"]]
