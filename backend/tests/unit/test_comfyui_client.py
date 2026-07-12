from unittest.mock import MagicMock

import pytest
import requests

from backend.services import comfyui_client


def test_probe_comfyui_instance_online(monkeypatch):
    response = MagicMock(status_code=200)
    monkeypatch.setattr("backend.services.comfyui_client.requests.get", lambda *args, **kwargs: response)
    result = comfyui_client.probe_comfyui_instance("127.0.0.1:8188")
    assert result["online"] is True
    assert result["address"] == "127.0.0.1:8188"
    assert "latency_ms" in result


def test_probe_comfyui_instance_offline(monkeypatch):
    def raise_timeout(*args, **kwargs):
        raise requests.Timeout("timed out")

    monkeypatch.setattr("backend.services.comfyui_client.requests.get", raise_timeout)
    result = comfyui_client.probe_comfyui_instance("127.0.0.1:8188")
    assert result["online"] is False
    assert "timed out" in result["error"]


def test_probe_comfyui_instance_invalid_address():
    result = comfyui_client.probe_comfyui_instance("invalid-host")
    assert result["online"] is False
    assert result["error"] == "地址不合法"


def test_probe_comfyui_instances_dedup(monkeypatch):
    calls: list[str] = []

    def fake_probe(addr, timeout=comfyui_client.PROBE_TIMEOUT_SEC):
        calls.append(addr)
        return {"address": addr, "online": True, "latency_ms": 1}

    monkeypatch.setattr("backend.services.comfyui_client.probe_comfyui_instance", fake_probe)
    result = comfyui_client.probe_comfyui_instances(["http://127.0.0.1:8188", "127.0.0.1:8188"])
    assert calls == ["127.0.0.1:8188"]
    assert result["online_count"] == 1
    assert result["total"] == 1


def test_check_upscale_availability_all_nodes_present(monkeypatch):
    comfyui_client.clear_upscale_availability_cache()
    monkeypatch.setattr(
        "backend.services.workflow_availability.check_workflow_availability",
        lambda name, force_refresh=False: {
            "workflow": name,
            "available": True,
            "missing_nodes": [],
            "missing_models": [],
        },
    )
    result = comfyui_client.check_upscale_availability(force_refresh=True)
    assert result == {"upscale_available": True}


def test_check_upscale_availability_missing_nodes(monkeypatch):
    comfyui_client.clear_upscale_availability_cache()
    monkeypatch.setattr(
        "backend.services.workflow_availability.check_workflow_availability",
        lambda name, force_refresh=False: {
            "workflow": name,
            "available": False,
            "missing_nodes": ["SeedVR2LoadDiTModel"],
            "missing_models": [],
            "reason": "缺少自定义节点: SeedVR2LoadDiTModel",
        },
    )
    result = comfyui_client.check_upscale_availability(force_refresh=True)
    assert result["upscale_available"] is False
    assert "SeedVR2LoadDiTModel" in result["reason"]


def test_check_upscale_availability_comfyui_offline(monkeypatch):
    comfyui_client.clear_upscale_availability_cache()
    monkeypatch.setattr(
        "backend.services.workflow_availability.check_workflow_availability",
        lambda name, force_refresh=False: {
            "workflow": name,
            "available": False,
            "missing_nodes": [],
            "missing_models": [],
            "reason": "ComfyUI 未在线，无法检测工作流依赖",
        },
    )
    result = comfyui_client.check_upscale_availability(force_refresh=True)
    assert result["upscale_available"] is False
    assert "ComfyUI" in result["reason"]


def test_check_upscale_availability_uses_cache(monkeypatch):
    comfyui_client.clear_upscale_availability_cache()
    probe_calls: list[str] = []

    def fake_check(name, force_refresh=False):
        probe_calls.append(name)
        return {
            "workflow": name,
            "available": True,
            "missing_nodes": [],
            "missing_models": [],
        }

    monkeypatch.setattr(
        "backend.services.workflow_availability.check_workflow_availability",
        fake_check,
    )
    first = comfyui_client.check_upscale_availability(force_refresh=True)
    second = comfyui_client.check_upscale_availability(force_refresh=False)
    assert first == second == {"upscale_available": True}
    assert len(probe_calls) == 1
