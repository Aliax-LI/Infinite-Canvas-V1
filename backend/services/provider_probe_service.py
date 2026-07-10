import os
import re

import httpx
from fastapi import HTTPException

from backend.config import RUNNINGHUB_DEFAULT_BASE_URL
from backend.models.ai_providers import TestConnectionPayload
from backend.services import cli_tools_service, runninghub_models_service
from backend.services.api_providers_service import (
    bearer_auth_value,
    get_api_provider_exact,
    is_modelscope_context,
    provider_env_key_value,
    runninghub_wallet_key_env,
)

CODEX_DEFAULT_IMAGE_MODELS = ["gpt-image-2"]
CODEX_DEFAULT_CHAT_MODELS = ["gpt-5.5"]
GEMINI_CLI_DEFAULT_IMAGE_MODELS = ["auto"]
GEMINI_CLI_DEFAULT_CHAT_MODELS = ["auto"]
JIMENG_DEFAULT_IMAGE_MODELS = ["5.0", "4.6", "4.5", "4.1", "4.0", "3.1", "3.0"]
JIMENG_DEFAULT_VIDEO_MODELS = [
    "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0", "seedance2.0fast",
    "3.5pro", "3.0pro", "3.0", "3.0fast",
]


def protocol_from_payload(payload: TestConnectionPayload) -> str:
    provider_id = str(payload.provider_id or "").strip().lower()
    if provider_id in {"volcengine", "runninghub", "jimeng", "codex"}:
        return provider_id
    if provider_id == "gemini-cli" or payload.protocol == "gemini-cli":
        return "gemini-cli"
    base_url = str(payload.base_url or "").strip().lower()
    if "runninghub.cn" in base_url or "runninghub.ai" in base_url:
        return "runninghub"
    protocol = str(payload.protocol or "openai").strip().lower()
    return protocol if protocol in {"openai", "gemini", "volcengine", "runninghub", "jimeng", "codex", "gemini-cli"} else "openai"


def api_key_from_payload(payload: TestConnectionPayload, protocol: str = "") -> str:
    explicit = str(payload.api_key or "").strip()
    provider_id = str(payload.provider_id or "").strip().lower()
    protocol = protocol or protocol_from_payload(payload)
    if explicit:
        return explicit
    if provider_id:
        if provider_id == "runninghub":
            wallet = os.getenv(runninghub_wallet_key_env(), "")
            if wallet:
                return wallet
        value = provider_env_key_value(provider_id)
        if value:
            return value
    return ""


def codex_models_payload(raw=None) -> dict:
    all_models = [*CODEX_DEFAULT_IMAGE_MODELS, *CODEX_DEFAULT_CHAT_MODELS]
    return {
        "ok": True,
        "protocol": "codex",
        "status": 200,
        "message": "OpenAI Codex CLI 可用，模型列表来自本机 CLI 默认配置。",
        "model_count": len(all_models),
        "image_models": CODEX_DEFAULT_IMAGE_MODELS,
        "chat_models": CODEX_DEFAULT_CHAT_MODELS,
        "video_models": [],
        "all": all_models,
        "raw": raw or {},
    }


def gemini_cli_models_payload(raw=None) -> dict:
    all_models = [*GEMINI_CLI_DEFAULT_IMAGE_MODELS, *GEMINI_CLI_DEFAULT_CHAT_MODELS]
    return {
        "ok": True,
        "protocol": "gemini-cli",
        "status": 200,
        "message": "Antigravity CLI 可用，模型列表使用 auto 默认模型。",
        "model_count": len(all_models),
        "image_models": GEMINI_CLI_DEFAULT_IMAGE_MODELS,
        "chat_models": GEMINI_CLI_DEFAULT_CHAT_MODELS,
        "video_models": [],
        "all": all_models,
        "raw": raw or {},
    }




def looks_like_html_response(text: str) -> bool:
    sample = str(text or "").lstrip()[:200].lower()
    return sample.startswith("<!doctype html") or sample.startswith("<html") or "<head" in sample


def classify_upstream_model(model_id: str) -> str:
    lc = str(model_id or "").lower()
    video_keys = ["veo", "sora", "wan2", "wanx", "doubao-seedance", "video", "t2v-", "i2v-"]
    if any(k in lc for k in video_keys):
        return "video"
    image_keys = [
        "banana", "image", "dalle", "dall-e", "imagen", "flux", "stable", "sdxl", "midjourney",
        "nano-banana", "ideogram", "fal-ai", "z-image", "qwen-image", "klein", "seedream",
        "doubao-seedream", "text-to-image", "image-to-image",
    ]
    if any(k in lc for k in image_keys):
        return "image"
    return "chat"


def parse_upstream_models(raw: dict, protocol: str = "openai") -> tuple[dict[str, list[str]], list[str]]:
    items = raw.get("data") if isinstance(raw, dict) else None
    if not items and isinstance(raw, dict):
        items = raw.get("models") or raw.get("list") or []
    if not isinstance(items, list):
        items = []
    ids: list[str] = []
    for item in items:
        if isinstance(item, str):
            mid = item
        elif isinstance(item, dict):
            mid = item.get("id") or item.get("name") or item.get("model")
        else:
            mid = ""
        if mid:
            mid = str(mid)
            if protocol == "gemini" and mid.startswith("models/"):
                mid = mid[len("models/") :]
            ids.append(mid)
    ids = sorted(set(ids))
    grouped: dict[str, list[str]] = {"image": [], "chat": [], "video": []}
    for mid in ids:
        grouped[classify_upstream_model(mid)].append(mid)
    return grouped, ids


def upstream_models_url(base_url: str, protocol: str) -> str:
    if protocol == "gemini":
        return f"{base_url}/models" if base_url.endswith("/v1beta") else f"{base_url}/v1beta/models"
    if protocol == "volcengine":
        return f"{base_url}/models" if base_url.endswith("/api/v3") else f"{base_url}/api/v3/models"
    return f"{base_url}/models" if base_url.endswith("/v1") else f"{base_url}/v1/models"


def upstream_model_headers(api_key: str, protocol: str) -> dict[str, str]:
    if protocol == "gemini":
        return {"x-goog-api-key": api_key, "Accept": "application/json"}
    return {"Authorization": bearer_auth_value(api_key), "Accept": "application/json"}


async def probe_openai_compatible_models(base_url: str, api_key: str, protocol: str = "openai") -> dict:
    base_url = str(base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    if not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail="请求地址必须以 http:// 或 https:// 开头")
    if not api_key:
        raise HTTPException(status_code=400, detail="请先填写或保存 API Key")
    url = upstream_models_url(base_url, protocol)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=upstream_model_headers(api_key, protocol))
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location") or resp.headers.get("location") or ""
                suffix = f"：{location}" if location else ""
                return {"ok": False, "status": resp.status_code, "message": f"上游 /v1/models 发生跳转{suffix}"}
            if looks_like_html_response(resp.text):
                return {"ok": False, "status": resp.status_code, "message": "上游返回网页 HTML，请检查是否为 API Base URL"}
            if resp.status_code >= 400:
                return {"ok": False, "status": resp.status_code, "message": resp.text[:300]}
            data = resp.json() if resp.text else {}
            grouped, ids = parse_upstream_models(data, protocol)
            result = {
                "ok": True,
                "status": resp.status_code,
                "model_count": len(ids),
                "image_models": grouped["image"],
                "chat_models": grouped["chat"],
                "video_models": grouped["video"],
                "all": ids,
            }
            return result
    except httpx.HTTPError as exc:
        return {"ok": False, "status": 0, "message": str(exc)[:300]}


async def test_provider_connection(payload: TestConnectionPayload) -> dict:
    protocol = protocol_from_payload(payload)
    if protocol == "codex":
        status = await cli_tools_service.codex_status()
        result = codex_models_payload(raw={"status": status})
        result.update({
            "ok": bool(status.get("installed")),
            "status": 200 if status.get("installed") else 0,
            "message": status.get("message") or ("OpenAI Codex CLI 可用" if status.get("installed") else "未找到 OpenAI Codex CLI"),
        })
        return result
    if protocol == "gemini-cli":
        status = await cli_tools_service.gemini_cli_status()
        result = gemini_cli_models_payload(raw={"status": status})
        result.update({
            "ok": bool(status.get("installed")),
            "status": 200 if status.get("installed") else 0,
            "message": status.get("message") or ("Antigravity CLI 可用" if status.get("installed") else "未找到 Antigravity CLI"),
        })
        return result
    if protocol == "jimeng":
        status = await jimeng_cli_service.jimeng_status()
        return {
            "ok": bool(status.get("installed") and status.get("logged_in")),
            "status": 200 if status.get("logged_in") else 0,
            "message": status.get("message") or "即梦 CLI 已登录",
            "model_count": len(JIMENG_DEFAULT_IMAGE_MODELS) + len(JIMENG_DEFAULT_VIDEO_MODELS),
            "image_models": JIMENG_DEFAULT_IMAGE_MODELS,
            "chat_models": [],
            "video_models": JIMENG_DEFAULT_VIDEO_MODELS,
            "all": [*JIMENG_DEFAULT_IMAGE_MODELS, *JIMENG_DEFAULT_VIDEO_MODELS],
            "raw": status,
        }
    if protocol == "runninghub":
        provider = {"id": "runninghub", "base_url": payload.base_url or RUNNINGHUB_DEFAULT_BASE_URL, "protocol": "runninghub", "api_key": api_key_from_payload(payload, protocol)}
        result = await runninghub_models_service.runninghub_models_payload(provider)
        return {"ok": True, "protocol": "runninghub", "status": 200, **result}
    if protocol in {"openai", "gemini", "apimart", "volcengine"}:
        from backend.services.upstream_probe_service import probe_http_models
        from fastapi import HTTPException as _HTTPException
        try:
            return await probe_http_models(payload.base_url, api_key_from_payload(payload, protocol), protocol)
        except ValueError as exc:
            raise _HTTPException(status_code=400, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            if protocol == "volcengine":
                from backend.services.upstream_probe_service import probe_volcengine_auto_detect, volcengine_default_model_payload
                async with httpx.AsyncClient(timeout=15) as client:
                    detected, probe = await probe_volcengine_auto_detect(client, payload.base_url, api_key_from_payload(payload, protocol))
                    if detected:
                        message = f"{probe.get('message') or '方舟任务接口可达'}；但模型列表请求失败。请按实际方舟控制台模型名称手动填写视频模型。"
                        return volcengine_default_model_payload(status=probe.get("status") or 0, message=message, raw={"models_error": str(exc)[:300], **(probe.get("raw") or {})})
            return {"ok": False, "status": 0, "message": str(exc)[:300]}
    raise HTTPException(status_code=503, detail="上游 HTTP 探测尚未迁移，暂不支持该协议")


async def fetch_models_from_provider(provider_id: str) -> dict:
    provider = get_api_provider_exact(provider_id)
    protocol = str(provider.get("protocol") or "openai").strip().lower()
    if protocol == "codex":
        status = await cli_tools_service.codex_status()
        payload = codex_models_payload(raw={"status": status})
        payload["message"] = status.get("message") or payload["message"]
        return {
            "total": payload["model_count"],
            "image_models": payload["image_models"],
            "chat_models": payload["chat_models"],
            "video_models": payload["video_models"],
            "all": payload["all"],
            "message": payload["message"],
            "raw": payload.get("raw"),
        }
    if protocol == "gemini-cli":
        status = await cli_tools_service.gemini_cli_status()
        payload = gemini_cli_models_payload(raw={"status": status})
        payload["message"] = status.get("message") or payload["message"]
        return {
            "total": payload["model_count"],
            "image_models": payload["image_models"],
            "chat_models": payload["chat_models"],
            "video_models": payload["video_models"],
            "all": payload["all"],
            "message": payload["message"],
            "raw": payload.get("raw"),
        }
    if protocol == "jimeng":
        return {
            "total": len(JIMENG_DEFAULT_IMAGE_MODELS) + len(JIMENG_DEFAULT_VIDEO_MODELS),
            "image_models": JIMENG_DEFAULT_IMAGE_MODELS,
            "chat_models": [],
            "video_models": JIMENG_DEFAULT_VIDEO_MODELS,
            "all": [*JIMENG_DEFAULT_IMAGE_MODELS, *JIMENG_DEFAULT_VIDEO_MODELS],
        }
    if protocol in {"openai", "gemini", "apimart"}:
        api_key = provider_env_key_value(provider["id"])
        if not api_key:
            raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider_id} 未配置 API Key")
        result = await probe_openai_compatible_models(provider.get("base_url") or "", api_key, protocol)
        if not result.get("ok"):
            raise HTTPException(status_code=result.get("status") or 502, detail=result.get("message") or "拉取失败")
        fetch = {
            "total": result.get("model_count") or 0,
            "image_models": result.get("image_models") or [],
            "chat_models": result.get("chat_models") or [],
            "video_models": result.get("video_models") or [],
            "all": result.get("all") or [],
            "message": result.get("message"),
        }
        if is_modelscope_context(provider_id, provider.get("base_url") or ""):
            from backend.services.modelscope_dolphin_service import enrich_modelscope_fetch_result

            fetch = await enrich_modelscope_fetch_result(fetch)
        return fetch
    if protocol == "volcengine":
        api_key = provider_env_key_value(provider["id"])
        if not api_key:
            raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider_id} 未配置 API Key")
        from backend.services.upstream_probe_service import probe_http_models
        result = await probe_http_models(provider.get("base_url") or "", api_key, "volcengine")
        if not result.get("ok"):
            raise HTTPException(status_code=result.get("status") or 502, detail=result.get("message") or "拉取失败")
        return {
            "total": result.get("model_count") or 0,
            "image_models": result.get("image_models") or [],
            "chat_models": result.get("chat_models") or [],
            "video_models": result.get("video_models") or [],
            "all": result.get("all") or [],
            "message": result.get("message"),
            "protocol": result.get("protocol"),
        }
    if protocol == "runninghub":
        return await runninghub_models_service.runninghub_models_payload(provider)
    raise HTTPException(status_code=503, detail="上游模型拉取尚未迁移，暂不支持该协议")


def _connection_to_fetch_payload(result: dict) -> dict:
    return {
        "total": result.get("model_count") or len(result.get("all") or []),
        "image_models": result.get("image_models") or [],
        "chat_models": result.get("chat_models") or [],
        "video_models": result.get("video_models") or [],
        "all": result.get("all") or [],
        "message": result.get("message"),
        "raw": result.get("raw"),
        "protocol": result.get("protocol"),
    }


async def probe_async_endpoint(payload: TestConnectionPayload) -> dict:
    protocol = protocol_from_payload(payload)
    if protocol == "codex":
        status = await cli_tools_service.codex_status()
        return {
            "ok": bool(status.get("installed")),
            "protocol": "codex",
            "status_code": 200 if status.get("installed") else 0,
            "message": status.get("message") or "OpenAI Codex CLI 本机检测完成",
            "raw": status,
        }
    if protocol == "gemini-cli":
        status = await cli_tools_service.gemini_cli_status()
        return {
            "ok": bool(status.get("installed")),
            "protocol": "gemini-cli",
            "status_code": 200 if status.get("installed") else 0,
            "message": status.get("message") or "Antigravity CLI 本机检测完成",
            "raw": status,
        }
    raise HTTPException(status_code=503, detail="异步协议探测尚未迁移，暂仅支持 codex / gemini-cli")


async def fetch_models_from_payload(payload: TestConnectionPayload) -> dict:
    result = await test_provider_connection(payload)
    fetch = _connection_to_fetch_payload(result)
    if is_modelscope_context(str(payload.provider_id or ""), str(payload.base_url or "")):
        from backend.services.modelscope_dolphin_service import enrich_modelscope_fetch_result

        fetch = await enrich_modelscope_fetch_result(fetch)
    return fetch
