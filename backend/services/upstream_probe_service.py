import re

import httpx

from backend.services.api_providers_service import (
    bearer_auth_value,
    is_modelscope_context,
)
from backend.services.provider_probe_service import (
    looks_like_html_response,
    parse_upstream_models,
    upstream_model_headers,
)


def upstream_models_url_volcengine(base_url: str) -> str:
    base_url = str(base_url or "").strip().rstrip("/")
    return f"{base_url}/models" if base_url.endswith("/api/v3") else f"{base_url}/api/v3/models"


def volcengine_default_model_payload(status=200, message="", raw=None):
    return {
        "ok": True,
        "protocol": "volcengine",
        "status": status,
        "message": message or "方舟任务接口可用，模型列表接口未返回模型。请按实际方舟控制台模型名称手动填写视频模型。",
        "model_count": 0,
        "image_models": [],
        "chat_models": [],
        "video_models": [],
        "all": [],
        "raw": raw,
    }


def volcengine_task_probe_url(base_url: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    if not base:
        return ""
    if base.endswith("/api/v3"):
        return f"{base}/contents/generations/tasks/healthcheck_probe_do_not_submit"
    return f"{base}/api/v3/contents/generations/tasks/healthcheck_probe_do_not_submit"


async def probe_volcengine_task_endpoint(client, base_url: str, api_key: str):
    probe_url = volcengine_task_probe_url(base_url)
    if not probe_url:
        return False, {"status": 0, "message": "Base URL 为空"}
    response = await client.get(probe_url, headers=upstream_model_headers(api_key, "volcengine"))
    try:
        raw = response.json() if response.text else {}
    except Exception:
        raw = response.text[:500]
    if response.status_code in (401, 403):
        return False, {"status": response.status_code, "message": "方舟 API Key 无效或无权限", "raw": raw}
    if looks_like_html_response(response.text):
        return False, {"status": response.status_code, "message": "任务接口返回 HTML，Base URL 可能不是 API 地址", "raw": raw}
    if response.status_code < 500:
        return True, {"status": response.status_code, "message": "方舟任务查询端点可达", "raw": raw}
    return False, {"status": response.status_code, "message": f"方舟任务接口服务端错误 {response.status_code}", "raw": raw}


def openai_compat_root_for_probe(base_url: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    if base.endswith("/api/v3"):
        base = base[: -len("/api/v3")]
    if base.endswith("/v1"):
        return base
    return f"{base}/v1" if base else ""


async def probe_openai_compat_bearer_endpoint(client, base_url: str, api_key: str):
    root = openai_compat_root_for_probe(base_url)
    if not root:
        return False, {"status": 0, "message": "Base URL 为空"}
    url = f"{root}/chat/completions"
    response = await client.post(
        url,
        headers={**upstream_model_headers(api_key, "openai"), "Content-Type": "application/json"},
        json={"messages": []},
    )
    try:
        raw = response.json() if response.text else {}
    except Exception:
        raw = response.text[:500]
    if response.status_code in (401, 403):
        return False, {"status": response.status_code, "message": "API Key 无效或无权限", "raw": raw}
    if looks_like_html_response(response.text):
        return False, {"status": response.status_code, "message": "OpenAI 兼容入口返回 HTML，Base URL 可能不是 API 地址", "raw": raw}
    if response.status_code < 500:
        return True, {"status": response.status_code, "message": "OpenAI 兼容 Bearer 鉴权入口可达", "raw": raw}
    return False, {"status": response.status_code, "message": f"OpenAI 兼容入口服务端错误 {response.status_code}", "raw": raw}


async def probe_volcengine_auto_detect(client, base_url: str, api_key: str):
    task_ok, task_probe = await probe_volcengine_task_endpoint(client, base_url, api_key)
    if task_ok:
        return True, {
            "status": task_probe.get("status") or 200,
            "message": "检测到方舟/Ark 任务协议",
            "raw": {"task_probe": task_probe.get("raw")},
        }
    compat_ok, compat_probe = await probe_openai_compat_bearer_endpoint(client, base_url, api_key)
    if compat_ok:
        return True, {
            "status": compat_probe.get("status") or 200,
            "message": "检测到方舟/Ark Bearer 鉴权入口（OpenAI 兼容透传）",
            "raw": {"task_probe": task_probe, "openai_compat_probe": compat_probe.get("raw")},
        }
    return False, {
        "status": compat_probe.get("status") or task_probe.get("status") or 0,
        "message": compat_probe.get("message") or task_probe.get("message") or "未检测到方舟/Ark 兼容入口",
        "raw": {"task_probe": task_probe, "openai_compat_probe": compat_probe.get("raw")},
    }


async def probe_http_models(base_url: str, api_key: str, protocol: str) -> dict:
    base_url = str(base_url or "").strip().rstrip("/")
    if not base_url:
        raise ValueError("请先填写请求地址")
    if not re.match(r"^https?://", base_url):
        raise ValueError("请求地址必须以 http:// 或 https:// 开头")
    if not api_key:
        raise ValueError("请先填写或保存 API Key")
    if protocol == "volcengine":
        url = upstream_models_url_volcengine(base_url)
    elif protocol == "gemini":
        url = f"{base_url}/models" if base_url.endswith("/v1beta") else f"{base_url}/v1beta/models"
    else:
        url = f"{base_url}/models" if base_url.endswith("/v1") else f"{base_url}/v1/models"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=upstream_model_headers(api_key, protocol if protocol != "apimart" else "openai"))
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("Location") or resp.headers.get("location") or ""
            suffix = f"：{location}" if location else ""
            label = "/api/v3/models" if protocol == "volcengine" else "/v1/models"
            return {"ok": False, "status": resp.status_code, "message": f"上游 {label} 发生跳转{suffix}"}
        if looks_like_html_response(resp.text):
            label = "/api/v3/models" if protocol == "volcengine" else "/v1/models"
            return {"ok": False, "status": resp.status_code, "message": f"上游 {label} 返回网页 HTML，请检查请求地址是否为 API Base URL"}
        if resp.status_code >= 400:
            if protocol in {"volcengine", "openai"}:
                detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
                if detected:
                    if protocol == "volcengine":
                        message = f"{probe.get('message') or '方舟任务接口可达'}；但 /api/v3/models 不可用。请按实际方舟控制台模型名称手动填写视频模型。"
                    else:
                        message = f"{probe.get('message') or '检测到方舟/Ark 兼容入口'}；OpenAI /v1/models 不可用，已自动切换为方舟协议。请按实际方舟控制台模型名称手动填写视频模型。"
                    return volcengine_default_model_payload(status=probe.get("status") or resp.status_code, message=message, raw={"models_error": resp.text[:300], **(probe.get("raw") or {})})
            return {"ok": False, "status": resp.status_code, "message": resp.text[:300]}
        data = resp.json() if resp.text else {}
        grouped, ids = parse_upstream_models(data, protocol)
        if protocol == "volcengine" and not ids:
            detected, probe = await probe_volcengine_auto_detect(client, base_url, api_key)
            if detected:
                return volcengine_default_model_payload(status=resp.status_code, raw=data)
        result = {
            "ok": True,
            "protocol": protocol,
            "status": resp.status_code,
            "model_count": len(ids),
            "image_models": grouped["image"],
            "chat_models": grouped["chat"],
            "video_models": grouped["video"],
            "all": ids,
            "message": f"上游模型列表可用，找到 {len(ids)} 个模型" if ids else "上游模型列表可用",
            "raw": data,
        }
        return result
