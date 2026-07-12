import pytest


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


def test_upscale_availability_endpoint(comfyui_client, monkeypatch):
    monkeypatch.setattr(
        "backend.services.comfyui_client.check_upscale_availability",
        lambda: {"upscale_available": False, "reason": "缺少 SeedVR2 自定义节点: SeedVR2LoadDiTModel"},
    )
    response = comfyui_client.get("/api/comfyui/upscale-availability")
    assert response.status_code == 200
    body = response.json()
    assert body["upscale_available"] is False
    assert "SeedVR2LoadDiTModel" in body["reason"]


def test_workflow_availability_endpoint(comfyui_client, monkeypatch):
    monkeypatch.setattr(
        "backend.services.comfyui_client.check_workflow_availability",
        lambda name, force_refresh=False: {
            "workflow": name,
            "available": False,
            "missing_nodes": ["CustomNode"],
            "missing_models": [],
            "reason": "缺少自定义节点: CustomNode",
        },
    )
    response = comfyui_client.get("/api/comfyui/workflow-availability", params={"workflow": "z-image-t2i.json"})
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["missing_nodes"] == ["CustomNode"]


def test_workflow_download_endpoint(comfyui_client):
    response = comfyui_client.get("/api/workflows/upscale.json/download")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "attachment" in response.headers.get("content-disposition", "").lower()
    body = response.json()
    assert isinstance(body.get("nodes"), list)
    types = {n.get("type") for n in body["nodes"] if isinstance(n, dict)}
    assert "SeedVR2LoadDiTModel" in types
    assert "SeedVR2VideoUpscaler" in types


@pytest.mark.parametrize(
    "workflow,required",
    [
        ("z-image-enhance.json", {"AIO_Preprocessor", "QwenImageDiffsynthControlnet", "ModelPatchLoader"}),
        ("upscale.json", {"SeedVR2LoadDiTModel", "SeedVR2VideoUpscaler"}),
        ("Flux2-Klein.json", {"LoadDiffusionModelShared //Inspire", "ComfySwitchNode"}),
        ("z-image-control.json", {"QwenImageDiffsynthControlnet", "ModelPatchLoader", "Canny"}),
    ],
)
def test_workflow_download_contains_generate_class_types(comfyui_client, workflow, required):
    from pathlib import Path

    wf_path = Path(__file__).resolve().parents[3] / "workflows" / workflow
    if not wf_path.is_file() and workflow == "z-image-enhance.json":
        workflow = "Z-Image-Enhance.json"
        wf_path = Path(__file__).resolve().parents[3] / "workflows" / workflow
    if not wf_path.is_file():
        pytest.skip(f"{workflow} missing")

    response = comfyui_client.get(f"/api/workflows/{workflow}/download")
    assert response.status_code == 200
    body = response.json()
    types = {n.get("type") for n in body.get("nodes") or [] if isinstance(n, dict)}
    assert required <= types, f"{workflow} export missing {required - types}"
