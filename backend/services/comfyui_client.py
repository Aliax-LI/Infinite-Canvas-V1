import re
import time

import requests

import backend.config as app_config
from backend.config import COMFYUI_INSTANCES

_instances: list[str] = list(COMFYUI_INSTANCES)
PROBE_TIMEOUT_SEC = 2.0
UPSCALE_REQUIRED_NODE_TYPES = (
    "SeedVR2LoadDiTModel",
    "SeedVR2LoadVAEModel",
    "SeedVR2VideoUpscaler",
)
UPSCALE_PROBE_CACHE_TTL_SEC = 60.0
_upscale_availability_cache: dict | None = None
_upscale_availability_cached_at: float = 0.0


def comfyui_instances() -> list[str]:
    return list(_instances)


def set_comfyui_instances(instances: list[str]) -> list[str]:
    global _instances
    cleaned = list(instances)
    _instances = cleaned
    app_config.COMFYUI_INSTANCES = cleaned
    return cleaned


def fetch_view_from_comfyui(filename: str, type_: str = "input", subfolder: str = "") -> tuple[bytes, str] | None:
    for addr in comfyui_instances():
        try:
            url = f"http://{addr}/view"
            params = {"filename": filename, "type": type_, "subfolder": subfolder}
            response = requests.get(url, params=params, timeout=1)
            if response.status_code == 200:
                return response.content, response.headers.get("Content-Type") or "application/octet-stream"
        except requests.RequestException:
            continue
    return None


def normalize_comfy_address(addr: str) -> str | None:
    s = re.sub(r"^https?://", "", str(addr or "").strip()).rstrip("/")
    if not s or ":" not in s:
        return None
    host, _, port = s.rpartition(":")
    if not host or not port.isdigit():
        return None
    return s


def probe_comfyui_instance(addr: str, timeout: float = PROBE_TIMEOUT_SEC) -> dict:
    normalized = normalize_comfy_address(addr)
    if not normalized:
        return {"address": str(addr or "").strip(), "online": False, "error": "地址不合法"}
    start = time.perf_counter()
    try:
        response = requests.get(f"http://{normalized}/queue", timeout=timeout)
        latency_ms = int((time.perf_counter() - start) * 1000)
        if response.status_code == 200:
            return {"address": normalized, "online": True, "latency_ms": latency_ms}
        return {
            "address": normalized,
            "online": False,
            "latency_ms": latency_ms,
            "error": f"HTTP {response.status_code}",
        }
    except requests.RequestException as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"address": normalized, "online": False, "latency_ms": latency_ms, "error": str(exc)}


def probe_comfyui_instances(instances: list[str] | None = None) -> dict:
    targets = instances if instances is not None else comfyui_instances()
    cleaned: list[str] = []
    for item in targets:
        normalized = normalize_comfy_address(item)
        if normalized and normalized not in cleaned:
            cleaned.append(normalized)
    results = [probe_comfyui_instance(addr) for addr in cleaned]
    online_count = sum(1 for item in results if item.get("online"))
    return {"instances": results, "online_count": online_count, "total": len(results)}


def clear_upscale_availability_cache() -> None:
    global _upscale_availability_cache, _upscale_availability_cached_at
    _upscale_availability_cache = None
    _upscale_availability_cached_at = 0.0


def check_workflow_availability(name: str, *, force_refresh: bool = False) -> dict:
    from backend.services.workflow_availability import check_workflow_availability as _check

    return _check(name, force_refresh=force_refresh)


def check_workflows_availability(names: list[str], *, force_refresh: bool = False) -> dict:
    from backend.services.workflow_availability import check_workflows_availability as _check_many

    return _check_many(names, force_refresh=force_refresh)


def _fetch_object_info(addr: str, timeout: float = PROBE_TIMEOUT_SEC) -> dict | None:
    normalized = normalize_comfy_address(addr)
    if not normalized:
        return None
    try:
        response = requests.get(f"http://{normalized}/object_info", timeout=timeout)
        if response.status_code != 200:
            return None
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except (requests.RequestException, ValueError):
        return None


def _first_online_comfyui_address() -> str | None:
    for item in probe_comfyui_instances()["instances"]:
        if item.get("online"):
            return str(item.get("address") or "")
    return None


def check_upscale_availability(*, force_refresh: bool = False) -> dict:
    global _upscale_availability_cache, _upscale_availability_cached_at
    now = time.time()
    if (
        not force_refresh
        and _upscale_availability_cache is not None
        and (now - _upscale_availability_cached_at) < UPSCALE_PROBE_CACHE_TTL_SEC
    ):
        return dict(_upscale_availability_cache)

    from backend.services.workflow_availability import check_workflow_availability

    probe = check_workflow_availability("upscale.json", force_refresh=force_refresh)
    if probe.get("available"):
        result = {"upscale_available": True}
    else:
        reason = str(probe.get("reason") or "").strip()
        if not reason:
            missing = probe.get("missing_nodes") or []
            reason = f"缺少 SeedVR2 自定义节点: {', '.join(missing)}" if missing else "超分辨率工作流不可用"
        result = {"upscale_available": False, "reason": reason}
    _upscale_availability_cache = result
    _upscale_availability_cached_at = now
    return dict(result)


def upload_image_to_comfyui(filename: str, content: bytes, content_type: str) -> str | None:
    last_name = None
    for addr in comfyui_instances():
        try:
            files_data = {"image": (filename, content, content_type)}
            response = requests.post(f"http://{addr}/upload/image", files=files_data, timeout=10)
            if response.status_code == 200:
                last_name = response.json().get("name", filename)
        except requests.RequestException:
            continue
    return last_name
