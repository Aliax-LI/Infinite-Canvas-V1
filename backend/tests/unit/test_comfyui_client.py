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
