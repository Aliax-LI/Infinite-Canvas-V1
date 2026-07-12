import json
import os
import re
import uuid

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from backend.config import RUNNINGHUB_DEFAULT_BASE_URL
from backend.models.generate import CanvasLLMRequest, ChatRequest
from backend.services.ai_config_service import (
    AI_API_KEY,
    AI_BASE_URL,
    CHAT_MODEL,
    IMAGE_MODEL,
    modelscope_api_key,
    modelscope_chat_models,
)
from backend.services import conversation_service
from backend.services.api_providers_service import (
    bearer_auth_value,
    get_api_provider,
    load_api_providers,
    provider_env_key_value,
)
from backend.services.common import now_ms
from backend.services.media_paths import output_file_from_url

MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "30"))
AI_REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "1800"))
RUNNINGHUB_LLM_BASE_URL = "https://llm.runninghub.cn/v1"


def provider_protocol(provider: dict) -> str:
    return str((provider or {}).get("protocol") or "openai").strip().lower()


def is_codex_provider(provider: dict) -> bool:
    return provider_protocol(provider) == "codex"


def is_gemini_cli_provider(provider: dict) -> bool:
    return provider_protocol(provider) == "gemini-cli"


def is_volcengine_provider(provider: dict) -> bool:
    return provider_protocol(provider) == "volcengine"


def is_apimart_provider(provider: dict) -> bool:
    base_url = str((provider or {}).get("base_url") or "").lower()
    return provider_protocol(provider) == "apimart" or "apimart.ai" in base_url


def effective_protocol(provider: dict, model: str = "") -> str:
    return provider_protocol(provider)


def selected_model(requested: str, fallback: str) -> str:
    model = (requested or fallback).strip()
    if not model:
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    return model


def preferred_chat_model(provider: dict) -> str:
    models = [str(item or "").strip() for item in (provider.get("chat_models") or []) if str(item or "").strip()]
    return models[0] if models else CHAT_MODEL


def unwrap_apimart_response(raw: dict) -> dict:
    if isinstance(raw, dict) and "data" in raw and isinstance(raw.get("data"), dict) and "choices" not in raw:
        return raw["data"]
    return raw


_THINK_TAG_RE = re.compile(
    r"<think>[\s\S]*?</think>|<thinking>[\s\S]*?</thinking>",
    re.IGNORECASE,
)
# Strong draw/create intents: used when a weak router returns action=chat
AGENT_STRONG_GENERATE_RE = re.compile(
    r"绘制|画画|作画|描绘|画一[张幅个]|画个|画张|生成一[张幅个]|生成张|出图|生图|"
    r"draw\s+(a|an|me)|generate\s+(a|an)\s+image|create\s+(a|an)\s+image",
    re.IGNORECASE,
)


def strip_think_tags(text: str) -> str:
    return _THINK_TAG_RE.sub("", str(text or "")).strip()


def _text_from_content_field(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(part for part in parts if part)
    if content is None:
        return ""
    return str(content)


def text_from_chat_response(data: dict) -> str:
    """Extract assistant text; tolerate thinking models with empty content."""
    data = unwrap_apimart_response(data)
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = strip_think_tags(_text_from_content_field(message.get("content", "")))
    if content:
        return content
    # Qwen3 / thinking models often put the final answer in reasoning fields
    for key in ("reasoning_content", "reasoning", "thinking"):
        alt = strip_think_tags(_text_from_content_field(message.get(key, "")))
        if alt:
            return alt
    return ""


def api_headers(provider: dict | None = None, model: str = "", json_body: bool = True) -> dict[str, str]:
    if provider:
        if is_codex_provider(provider) or is_gemini_cli_provider(provider):
            raise HTTPException(status_code=400, detail="CLI 协议使用本机登录态，不需要 API Key。")
        api_key = provider_env_key_value(provider["id"])
        provider_name = provider.get("name") or provider["id"]
        if not api_key:
            raise HTTPException(status_code=400, detail=f"未配置 {provider_name} 的 API Key，请在 API 平台管理中填写。")
    else:
        api_key = AI_API_KEY
        if not api_key:
            raise HTTPException(status_code=400, detail="未配置 COMFLY_API_KEY，请在设置页 API 中填写。")
    if provider and effective_protocol(provider, model) == "gemini":
        headers = {"Accept": "application/json", "x-goog-api-key": api_key}
    else:
        headers = {"Accept": "application/json", "Authorization": bearer_auth_value(api_key)}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def modelscope_api_root(provider: dict | None = None) -> str:
    base_root = str((provider or {}).get("base_url") or "https://api-inference.modelscope.cn/v1").strip().rstrip("/")
    return base_root if base_root.endswith("/v1") else f"{base_root}/v1"


def resolve_chat_provider(provider_id: str, model: str, ms_model: str):
    if provider_id == "modelscope":
        clean_token = modelscope_api_key()
        if not clean_token:
            raise HTTPException(status_code=400, detail="未配置 ModelScope API Key，请在 API 设置中填写。")
        ms_models = modelscope_chat_models()
        mdl = selected_model(ms_model or model, ms_models[0] if ms_models else "MiniMax/MiniMax-M2.7")
        return modelscope_api_root(), {"Authorization": bearer_auth_value(clean_token), "Content-Type": "application/json"}, mdl
    api_provider = get_api_provider(provider_id or "comfly")
    if is_codex_provider(api_provider):
        raise HTTPException(status_code=400, detail="OpenAI CLI 请使用 provider=codex 的专用通道。")
    if is_gemini_cli_provider(api_provider):
        raise HTTPException(status_code=400, detail="Antigravity CLI 请使用 provider=gemini-cli 的专用通道。")
    base_root = (api_provider.get("base_url") or AI_BASE_URL).rstrip("/")
    if not base_root:
        raise HTTPException(status_code=400, detail=f"{api_provider.get('name') or api_provider['id']} 未配置 Base URL")
    mdl = selected_model(model, preferred_chat_model(api_provider))
    protocol = effective_protocol(api_provider, mdl)
    if protocol == "gemini":
        base = base_root if base_root.endswith("/v1beta") else base_root + "/v1beta"
    elif protocol == "volcengine":
        base = base_root if base_root.endswith("/api/v3") else base_root + "/api/v3"
    elif protocol == "runninghub":
        base = RUNNINGHUB_LLM_BASE_URL
    else:
        base = base_root if base_root.endswith("/v1") else base_root + "/v1"
    return base, api_headers(provider=api_provider, model=mdl), mdl


async def build_canvas_llm_messages(payload: CanvasLLMRequest) -> list[dict]:
    from backend.services.canvas_llm_media_service import (
        is_image_reference_value,
        is_video_reference_value,
        media_reference_to_url,
        video_reference_to_frame_data_urls,
    )

    upstream_messages = []
    system_prompt = (payload.system_prompt or "").strip()
    if system_prompt:
        upstream_messages.append({"role": "system", "content": system_prompt})
    for item in (payload.messages or [])[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            upstream_messages.append({"role": role, "content": content})

    image_inputs = [img for img in (payload.images or []) if is_image_reference_value(img)]
    video_inputs = [video for video in (payload.videos or []) if is_video_reference_value(video)]
    if image_inputs or video_inputs:
        content_parts: list[dict] = [{"type": "text", "text": payload.message}]
        for img in image_inputs[:8]:
            if not img or not isinstance(img, str):
                continue
            ref_url = media_reference_to_url(img, max_image_size=1024)
            if not ref_url:
                continue
            content_parts.append({"type": "image_url", "image_url": {"url": ref_url}})
        ok_videos = 0
        for video in video_inputs[:3]:
            if not video or not isinstance(video, str):
                continue
            frame_urls = await video_reference_to_frame_data_urls(video, max_frames=6, max_size=768)
            if frame_urls:
                ok_videos += 1
                content_parts.append(
                    {
                        "type": "text",
                        "text": f"以下是视频 {ok_videos} 按时间顺序抽取的关键帧，请结合这些画面理解视频内容。",
                    }
                )
                for frame_url in frame_urls:
                    content_parts.append({"type": "image_url", "image_url": {"url": frame_url}})
            else:
                ref_url = media_reference_to_url(video)
                if not ref_url:
                    continue
                content_parts.append({"type": "video_url", "video_url": {"url": ref_url}})
        upstream_messages.append({"role": "user", "content": content_parts})
    else:
        upstream_messages.append({"role": "user", "content": payload.message})
    return upstream_messages


async def canvas_llm(payload: CanvasLLMRequest) -> dict:
    provider_id = str(payload.provider or "comfly").strip().lower()
    if provider_id == "modelscope":
        api_provider = get_api_provider("modelscope")
    else:
        api_provider = get_api_provider(provider_id)
    if is_codex_provider(api_provider):
        from backend.services.codex_cli_service import CODEX_DEFAULT_CHAT_MODELS, codex_chat_text

        model = selected_model(payload.model, (api_provider.get("chat_models") or CODEX_DEFAULT_CHAT_MODELS)[0])
        payload.model = model
        text, raw = await codex_chat_text(payload, payload.messages)
        return {"text": text, "model": model, "raw_usage": None, "raw": raw}
    if is_gemini_cli_provider(api_provider):
        from backend.services.gemini_cli_service import GEMINI_CLI_DEFAULT_CHAT_MODELS, gemini_cli_chat_text

        model = selected_model(payload.model, (api_provider.get("chat_models") or GEMINI_CLI_DEFAULT_CHAT_MODELS)[0])
        payload.model = model
        text, raw = await gemini_cli_chat_text(payload, payload.messages)
        return {"text": text, "model": model, "raw_usage": None, "raw": raw}

    chat_base, chat_hdrs, model = resolve_chat_provider(provider_id, payload.model, payload.ms_model)
    upstream_messages = await build_canvas_llm_messages(payload)
    llm_provider = api_provider if provider_id != "modelscope" else get_api_provider("modelscope")
    is_apimart = is_apimart_provider(llm_provider)

    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body: dict = {"model": model, "messages": upstream_messages}
            if is_apimart:
                req_body["stream"] = False
            response = await client.post(f"{chat_base}/chat/completions", headers=chat_hdrs, json=req_body)
            response.raise_for_status()
            if not response.content:
                raise HTTPException(status_code=502, detail="上游接口返回了空响应")
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        friendly = friendly_chat_error_detail(body, model, llm_provider)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游接口错误：{body[:300]}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc

    text = text_from_chat_response(raw).strip() if isinstance(raw, dict) else ""
    text = text or "接口返回了空回复。"
    raw_data = unwrap_apimart_response(raw) if isinstance(raw, dict) else {}
    return {"text": text, "model": model, "raw_usage": raw_data.get("usage")}


SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "You are a helpful assistant.")


def display_title(text: str) -> str:
    title = re.sub(r"\s+", " ", text or "").strip()
    return title[:24] or "新对话"


def chat_system_prompt(payload: ChatRequest) -> str:
    prompt = str(getattr(payload, "system_prompt", "") or "").strip()
    return prompt or SYSTEM_PROMPT


def upstream_message_from_record(item: dict) -> dict | None:
    role = item.get("role")
    if role not in {"user", "assistant"} or item.get("type") == "image":
        return None
    return {"role": role, "content": item.get("content", "")}


async def chat_image_reply(payload: ChatRequest, conversation: dict, refs: list[dict]) -> dict:
    from backend.services.jimeng_cli_service import save_ai_image_to_output
    from backend.services.online_image_service import generate_ai_image, image_references

    image_provider_id = payload.provider if payload.provider not in {"modelscope"} else "comfly"
    provider = get_api_provider(payload.image_provider or image_provider_id)
    default_model = (provider.get("image_models") or [IMAGE_MODEL])[0]
    model = selected_model(payload.image_model or payload.model, default_model)
    image_refs = image_references(refs)
    try:
        image_data, raw = await generate_ai_image(
            payload.message,
            payload.size,
            payload.quality,
            model,
            image_refs,
            provider["id"],
        )
        local_url = await save_ai_image_to_output(image_data, prefix="chat_")
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{body[:300]}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc
    return {
        "id": uuid.uuid4().hex,
        "role": "assistant",
        "type": "image",
        "content": payload.message,
        "image_url": local_url,
        "created_at": now_ms(),
        "model": model,
        "size": payload.size,
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }


async def chat_endpoint(payload: ChatRequest, user_id: str) -> dict:
    conversation = (
        conversation_service.load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else conversation_service.new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.model_dump() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    conversation_service.save_conversation(user_id, conversation)

    if payload.mode == "image":
        assistant_message = await chat_image_reply(payload, conversation, refs)
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        conversation_service.save_conversation(user_id, conversation)
        return {"conversation": conversation, "message": assistant_message}

    api_provider = get_api_provider(payload.provider)
    if is_codex_provider(api_provider):
        from backend.services.codex_cli_service import CODEX_DEFAULT_CHAT_MODELS, codex_chat_text

        model = selected_model(payload.model, (api_provider.get("chat_models") or CODEX_DEFAULT_CHAT_MODELS)[0])
        payload.model = model
        upstream_messages = [{"role": "system", "content": chat_system_prompt(payload)}]
        for item in conversation["messages"][-MAX_HISTORY_MESSAGES:]:
            msg = upstream_message_from_record(item)
            if msg:
                upstream_messages.append(msg)
        text, raw = await codex_chat_text(payload, conversation["messages"][-MAX_HISTORY_MESSAGES:])
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": text,
            "created_at": now_ms(),
            "model": model,
            "raw_usage": None,
            "raw": raw,
        }
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        conversation_service.save_conversation(user_id, conversation)
        return {"conversation": conversation, "message": assistant_message}
    if is_gemini_cli_provider(api_provider):
        from backend.services.gemini_cli_service import GEMINI_CLI_DEFAULT_CHAT_MODELS, gemini_cli_chat_text

        model = selected_model(payload.model, (api_provider.get("chat_models") or GEMINI_CLI_DEFAULT_CHAT_MODELS)[0])
        payload.model = model
        text, raw = await gemini_cli_chat_text(payload, conversation["messages"][-MAX_HISTORY_MESSAGES:])
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": text,
            "created_at": now_ms(),
            "model": model,
            "raw_usage": None,
            "raw": raw,
        }
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        conversation_service.save_conversation(user_id, conversation)
        return {"conversation": conversation, "message": assistant_message}

    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    llm_provider = api_provider if payload.provider != "modelscope" else get_api_provider("modelscope")
    is_apimart = is_apimart_provider(llm_provider)

    upstream_messages = [{"role": "system", "content": chat_system_prompt(payload)}]
    for item in conversation["messages"][-MAX_HISTORY_MESSAGES:]:
        msg = upstream_message_from_record(item)
        if msg:
            upstream_messages.append(msg)

    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body: dict = {"model": model, "messages": upstream_messages}
            if is_apimart:
                req_body["stream"] = False
            response = await client.post(f"{chat_base}/chat/completions", headers=chat_hdrs, json=req_body)
            response.raise_for_status()
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游接口错误：{body[:300]}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc

    raw_data = unwrap_apimart_response(raw) if isinstance(raw, dict) else raw
    assistant_message = {
        "id": uuid.uuid4().hex,
        "role": "assistant",
        "content": text_from_chat_response(raw).strip() or "接口返回了空回复。",
        "created_at": now_ms(),
        "model": model,
        "raw_usage": raw_data.get("usage") if isinstance(raw_data, dict) else None,
    }
    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = now_ms()
    conversation_service.save_conversation(user_id, conversation)
    return {"conversation": conversation, "message": assistant_message}


CHAT_RATIO_SIZE_OPTIONS = {
    "1:1": ("1024x1024", "1536x1536", "2048x2048"),
    "2:3": ("720x1080", "1024x1536", "1365x2048"),
    "3:2": ("1080x720", "1536x1024", "2048x1365"),
    "3:4": ("1008x1344", "1536x2048", "2448x3264"),
    "4:3": ("1344x1008", "2048x1536", "3264x2448"),
    "9:16": ("720x1280", "1080x1920", "1440x2560"),
    "16:9": ("1280x720", "1920x1080", "2560x1440"),
}

AGENT_ACTIONS = {"chat", "generate_image", "edit_image"}
AGENT_IMAGE_KEYWORDS = [
    "生成", "画", "绘制", "画画", "作画", "描绘", "出图", "生图", "图片", "图像",
    "海报", "头像", "壁纸", "插画", "照片",
    "photo", "image", "picture", "draw", "paint", "sketch", "generate",
]
AGENT_EDIT_KEYWORDS = [
    "修改", "改成", "换成", "调整", "优化", "编辑", "重绘", "上一张", "刚才",
    "这张", "那张", "参考图", "改图", "edit", "modify", "change", "revise",
]
CN_NUMERAL_MAP = {"一": 1, "二": 2, "两": 2, "俩": 2, "三": 3, "四": 4}


def _parse_size_pair(size: str) -> tuple[int, int]:
    match = re.search(r"(\d+)\s*[xX×*]\s*(\d+)", str(size or ""))
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))


def chat_prompt_size_override(message: str, current_size: str = "") -> str:
    text = str(message or "")
    direct = re.search(r"(?<!\d)([1-9]\d{2,4})\s*[xX×*]\s*([1-9]\d{2,4})(?!\d)", text)
    if direct:
        width, height = int(direct.group(1)), int(direct.group(2))
        if width >= 256 and height >= 256:
            return f"{width}x{height}"

    normalized = (
        text.replace("：", ":")
        .replace("﹕", ":")
        .replace("∶", ":")
        .replace("比", ":")
        .replace("／", "/")
        .replace("/", ":")
    )
    ratio_match = re.search(r"(?<!\d)(1|2|3|4|9|16)\s*:\s*(1|2|3|4|9|16)(?!\d)", normalized)
    if not ratio_match:
        return ""
    ratio = f"{int(ratio_match.group(1))}:{int(ratio_match.group(2))}"
    options = CHAT_RATIO_SIZE_OPTIONS.get(ratio)
    if not options:
        return ""
    width, height = _parse_size_pair(current_size)
    wants_4k = bool(re.search(r"(?i)\b4\s*k\b|4K|超清|超高分辨率", text))
    wants_2k = bool(re.search(r"(?i)\b2\s*k\b|2K|高清|高分辨率", text))
    long_edge = max(width, height)
    if wants_4k or long_edge >= 2400:
        return options[2] if len(options) > 2 else options[-1]
    if wants_2k or long_edge >= 1500:
        return options[1] if len(options) > 1 else options[0]
    return options[0]


def latest_chat_image_refs(conversation: dict, limit: int = 1) -> list[dict]:
    refs = []
    for item in reversed(conversation.get("messages") or []):
        url = item.get("image_url") if isinstance(item, dict) else ""
        if url:
            refs.append({"url": url, "name": item.get("content") or "上一张图片", "role": "source"})
        if len(refs) >= limit:
            break
    return refs


def image_size_from_reference(ref: dict) -> str:
    from PIL import Image

    path = output_file_from_url(ref)
    if not path:
        return ""
    try:
        with Image.open(path) as img:
            width, height = img.size
        if width > 0 and height > 0:
            return f"{width}x{height}"
    except Exception:
        return ""
    return ""


def chat_requested_image_count(message: str) -> int:
    text = str(message or "")
    match = re.search(r"(?<!\d)([1-4])\s*(?:张|幅|个|组|套)(?!\d)", text)
    if match:
        return max(1, min(4, int(match.group(1))))
    match = re.search(r"([一二两俩三四])\s*(?:张|幅|个|组|套)", text)
    if match:
        return max(1, min(4, CN_NUMERAL_MAP.get(match.group(1), 1)))
    return 1


def chat_split_parallel_prompts(prompt: str, count: int) -> list[str]:
    text = str(prompt or "").strip()
    if count <= 1:
        return [text]
    noun_match = re.search(r"(.+?)(?:的)?(海报|头像|壁纸|插画|照片|图片|图像)\s*$", text)
    if not noun_match:
        return [text] * count
    prefix = noun_match.group(1).strip()
    suffix = noun_match.group(2)
    prefix = re.sub(r"(?:再)?(?:生成|画|绘制|制作|创建)\s*[1-4一二两俩三四]?\s*(?:张|幅|个|组|套)?", "", prefix).strip()
    prefix = re.sub(r"[,，、\s]+$", "", prefix).strip()
    if not prefix:
        return [text] * count
    candidates = [
        item.strip(" ，,、")
        for item in re.split(r"\s*(?:和|与|、|，|,|\+|＋)\s*", prefix)
        if item.strip(" ，,、")
    ]
    if len(candidates) < count:
        return [text] * count
    return [f"{item}的{suffix}" for item in candidates[:count]]


def pick_chat_image_provider(provider_id: str = "", fallback_id: str = "") -> dict:
    providers = [p for p in load_api_providers() if p.get("enabled", True) and (p.get("image_models") or [])]
    for target in (provider_id, fallback_id):
        clean = str(target or "").strip().lower()
        if clean:
            matched = next((p for p in providers if p.get("id") == clean), None)
            if matched:
                return matched
    if providers:
        primary = next((p for p in providers if p.get("primary")), None)
        return primary or providers[0]
    return get_api_provider(provider_id or fallback_id or "comfly")


def heuristic_agent_decision(message: str, refs: list[dict], has_previous_image: bool) -> dict:
    text = str(message or "").strip().lower()
    has_image_word = any(key.lower() in text for key in AGENT_IMAGE_KEYWORDS)
    has_edit_word = any(key.lower() in text for key in AGENT_EDIT_KEYWORDS)
    if refs and (has_edit_word or has_image_word):
        return {"action": "edit_image", "prompt": message, "reply": ""}
    if has_previous_image and has_edit_word:
        return {"action": "edit_image", "prompt": message, "reply": ""}
    if has_image_word and not has_edit_word:
        return {"action": "generate_image", "prompt": message, "reply": ""}
    return {"action": "chat", "prompt": message, "reply": ""}


def parse_agent_decision(raw_text: str, message: str, refs: list[dict], has_previous_image: bool) -> dict:
    text = strip_think_tags(raw_text)
    data = None
    if text:
        match = re.search(r"\{[\s\S]*\}", text)
        candidate = match.group(0) if match else text
        try:
            data = json.loads(candidate)
        except Exception:
            data = None
    heuristic = heuristic_agent_decision(message, refs, has_previous_image)
    if not isinstance(data, dict):
        return heuristic
    action = str(data.get("action") or "").strip()
    if action not in AGENT_ACTIONS:
        action = heuristic["action"]
    prompt = str(data.get("prompt") or message).strip() or message
    reply = str(data.get("reply") or "").strip()
    if action == "edit_image" and not (refs or has_previous_image):
        action = "generate_image" if any(key.lower() in str(message).lower() for key in AGENT_IMAGE_KEYWORDS) else "chat"
    # Thinking / weak routers often return chat for clear draw requests (e.g. 「绘制」)
    if action == "chat" and heuristic["action"] == "generate_image" and AGENT_STRONG_GENERATE_RE.search(str(message or "")):
        action = "generate_image"
        prompt = prompt or heuristic["prompt"] or message
    elif action == "chat" and heuristic["action"] == "edit_image":
        action = "edit_image"
        prompt = prompt or heuristic["prompt"] or message
    return {"action": action, "prompt": prompt, "reply": reply}


async def decide_chat_agent_action(payload: ChatRequest, conversation: dict, refs: list[dict]) -> dict:
    has_previous_image = bool(latest_chat_image_refs(conversation, 1))
    fallback = heuristic_agent_decision(payload.message, refs, has_previous_image)
    provider_cfg = get_api_provider(payload.provider) if payload.provider not in {"modelscope"} else {}
    if is_codex_provider(provider_cfg):
        fallback["router_model"] = selected_model(payload.model, (provider_cfg.get("chat_models") or ["gpt-5"])[0])
        return fallback
    if is_gemini_cli_provider(provider_cfg):
        fallback["router_model"] = selected_model(payload.model, (provider_cfg.get("chat_models") or ["gemini-2.5-pro"])[0])
        return fallback
    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
    custom_system_prompt = str(getattr(payload, "system_prompt", "") or "").strip()
    system = (
        "你是图片创作聊天 Agent 的意图路由器。只返回 JSON，不要 Markdown。\n"
        "action 只能是 chat、generate_image、edit_image。\n"
        "chat: 普通问答或不需要调用图片工具。\n"
        "generate_image: 用户要求生成、绘制、创建新图片。\n"
        "edit_image: 用户要求修改参考图、上一张图、刚才生成的图，或上传了参考图并要求基于它变化。\n"
        "prompt 是交给生图/改图工具的完整中文提示词；普通聊天时也填用户原话。\n"
        "reply 是可选的短状态文本。"
    )
    upstream_messages = [{"role": "system", "content": system}]
    for item in history[-10:]:
        msg = upstream_message_from_record(item)
        if msg:
            upstream_messages.append(msg)
    upstream_messages.append(
        {
            "role": "user",
            "content": (
                f"当前用户输入：{payload.message}\n"
                f"用户设置的系统提示词：{custom_system_prompt or '无'}\n"
                f"本次上传参考图数量：{len(refs)}\n"
                f"对话中是否已有上一张生成图：{'是' if has_previous_image else '否'}\n"
                '请返回 JSON，例如 {"action":"generate_image","prompt":"...","reply":"..."}'
            ),
        }
    )
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body: dict = {"model": model, "messages": upstream_messages}
            if is_apimart_provider(provider_cfg):
                req_body["stream"] = False
            response = await client.post(f"{chat_base}/chat/completions", headers=chat_hdrs, json=req_body)
            response.raise_for_status()
            raw = response.json()
            decision = parse_agent_decision(text_from_chat_response(raw), payload.message, refs, has_previous_image)
            decision["router_model"] = model
            return decision
    except Exception:
        fallback["router_model"] = model
        return fallback


async def build_chat_text_reply(payload: ChatRequest, conversation: dict) -> dict:
    provider_cfg = get_api_provider(payload.provider) if payload.provider not in {"modelscope"} else {}
    if is_codex_provider(provider_cfg):
        from backend.services.codex_cli_service import CODEX_DEFAULT_CHAT_MODELS, codex_chat_text

        model = selected_model(payload.model, (provider_cfg.get("chat_models") or CODEX_DEFAULT_CHAT_MODELS)[0])
        payload.model = model
        text, raw = await codex_chat_text(payload, conversation["messages"][-MAX_HISTORY_MESSAGES:])
        return {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": text,
            "created_at": now_ms(),
            "model": model,
            "raw_usage": None,
            "raw": raw,
        }
    if is_gemini_cli_provider(provider_cfg):
        from backend.services.gemini_cli_service import GEMINI_CLI_DEFAULT_CHAT_MODELS, gemini_cli_chat_text

        model = selected_model(payload.model, (provider_cfg.get("chat_models") or GEMINI_CLI_DEFAULT_CHAT_MODELS)[0])
        payload.model = model
        text, raw = await gemini_cli_chat_text(payload, conversation["messages"][-MAX_HISTORY_MESSAGES:])
        return {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": text,
            "created_at": now_ms(),
            "model": model,
            "raw_usage": None,
            "raw": raw,
        }
    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    is_apimart = is_apimart_provider(provider_cfg)
    upstream_messages = [{"role": "system", "content": chat_system_prompt(payload)}]
    for item in conversation["messages"][-MAX_HISTORY_MESSAGES:]:
        msg = upstream_message_from_record(item)
        if msg:
            upstream_messages.append(msg)
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body: dict = {"model": model, "messages": upstream_messages}
            if is_apimart:
                req_body["stream"] = False
            response = await client.post(f"{chat_base}/chat/completions", headers=chat_hdrs, json=req_body)
            response.raise_for_status()
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游接口错误：{body[:300]}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    raw_data = unwrap_apimart_response(raw) if isinstance(raw, dict) else raw
    return {
        "id": uuid.uuid4().hex,
        "role": "assistant",
        "content": text_from_chat_response(raw).strip() or "接口返回了空回复。",
        "created_at": now_ms(),
        "model": model,
        "raw_usage": raw_data.get("usage") if isinstance(raw_data, dict) else None,
    }


def text_delta_from_chat_chunk(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    content = delta.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
        return "".join(parts)
    return str(content) if content else ""


def reasoning_delta_from_chat_chunk(data: dict) -> str:
    """Collect thinking tokens for empty-content fallback; do not stream to UI."""
    choices = data.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    for key in ("reasoning_content", "reasoning"):
        alt = delta.get(key, "")
        if isinstance(alt, str) and alt:
            return alt
    return ""


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def parse_error_payload_text(text: str) -> dict:
    body = str(text or "").strip()
    if not body:
        return {}
    try:
        parsed = json.loads(body)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def friendly_chat_error_detail(text: str, model: str = "", provider: dict | None = None) -> str:
    raw_text = str(text or "")
    lower_text = raw_text.lower()
    payload = parse_error_payload_text(raw_text)
    error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
    code = str(error.get("code") or payload.get("code") or "").strip()
    message = str(error.get("message") or payload.get("message") or "").strip()
    code_lc = code.lower()
    message_lc = message.lower()
    model_name = str(model or "").strip()
    if is_volcengine_provider(provider or {}):
        if code_lc in {"invalidendpointormodel.notfound", "invalidendpointormodel.modelidaccessdisabled"}:
            provider_name = (provider or {}).get("name") or (provider or {}).get("id") or "火山方舟"
            return (
                f"{provider_name} 当前不接受模型名「{model_name or '未指定'}」直接调用聊天接口，"
                f"请在火山方舟控制台创建并使用推理接入点 ID（形如 `ep-...`）作为聊天模型。"
            )
        if "does not exist or you do not have access to it" in message_lc:
            return (
                f"火山方舟找不到或无权访问聊天模型「{model_name or '未指定'}」。"
                f"请改成已开通的推理接入点 ID（`ep-...`）。"
            )
    if "unauthorized" in lower_text or "401" in lower_text:
        return "API Key 无效或已过期，请到「API 设置」检查 Key。"
    if "rate limit" in lower_text or "429" in lower_text:
        return "请求过于频繁，已被上游限流，请稍后再试。"
    return ""


async def chat_agent_endpoint(payload: ChatRequest, user_id: str) -> dict:
    from backend.services.jimeng_cli_service import save_ai_image_to_output
    from backend.services.online_image_service import generate_ai_image, image_references

    conversation = (
        conversation_service.load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else conversation_service.new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.model_dump() for ref in payload.reference_images if ref.url]
    image_refs = image_references(refs)
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": "agent",
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    conversation_service.save_conversation(user_id, conversation)

    decision = await decide_chat_agent_action(payload, conversation, image_refs)
    action = decision.get("action") or "chat"
    tool_refs = image_refs[:]
    inherited_size = ""
    if action == "edit_image" and not tool_refs:
        tool_refs = latest_chat_image_refs(conversation, 1)
        inherited_size = image_size_from_reference(tool_refs[0]) if tool_refs else ""
    if action == "edit_image" and not tool_refs:
        action = "generate_image"

    if action in {"generate_image", "edit_image"}:
        image_provider = pick_chat_image_provider(payload.image_provider or payload.provider, payload.provider)
        default_model = (image_provider.get("image_models") or [IMAGE_MODEL])[0]
        model = selected_model(payload.image_model or default_model, default_model)
        prompt = decision.get("prompt") or payload.message
        prompt_size = chat_prompt_size_override(payload.message, payload.size) or chat_prompt_size_override(prompt, payload.size)
        image_size = prompt_size or inherited_size or payload.size
        requested_count = 1 if action == "edit_image" else chat_requested_image_count(payload.message)
        prompts = chat_split_parallel_prompts(prompt, requested_count)
        local_urls = []
        raw_items = []
        try:
            for item_prompt in prompts:
                image_data, raw = await generate_ai_image(
                    item_prompt, image_size, payload.quality, model, tool_refs, image_provider["id"]
                )
                local_urls.append(await save_ai_image_to_output(image_data, prefix="chat_"))
                raw_items.append(raw)
        except httpx.HTTPStatusError as exc:
            body = exc.response.text or ""
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{body[:300]}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc
        local_url = local_urls[0] if local_urls else ""
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "type": "image",
            "content": prompt,
            "image_url": local_url,
            "image_urls": local_urls,
            "created_at": now_ms(),
            "model": model,
            "provider": image_provider["id"],
            "size": image_size,
            "image_count": len(local_urls),
            "prompts": prompts,
            "agent_action": action,
            "agent_reply": decision.get("reply") or "",
            "used_references": tool_refs,
            "raw_usage": raw_items[0].get("usage") if raw_items and isinstance(raw_items[0], dict) else None,
        }
    else:
        assistant_message = await build_chat_text_reply(payload, conversation)
        assistant_message["agent_action"] = "chat"

    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = now_ms()
    conversation_service.save_conversation(user_id, conversation)
    return {"conversation": conversation, "message": assistant_message, "agent": {"action": action, "decision": decision}}


async def chat_stream_endpoint(payload: ChatRequest, user_id: str):
    if payload.mode == "image":
        raise HTTPException(status_code=400, detail="图片模式请使用 /api/chat")

    conversation = (
        conversation_service.load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else conversation_service.new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.model_dump() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    conversation_service.save_conversation(user_id, conversation)

    stream_provider = get_api_provider(payload.provider)
    if is_codex_provider(stream_provider):
        from backend.services.codex_cli_service import CODEX_DEFAULT_CHAT_MODELS, codex_chat_text

        model = selected_model(payload.model, (stream_provider.get("chat_models") or CODEX_DEFAULT_CHAT_MODELS)[0])
        payload.model = model

        async def codex_stream():
            yield sse_event({"type": "meta", "conversation": conversation})
            try:
                text, raw = await codex_chat_text(payload, conversation["messages"][-MAX_HISTORY_MESSAGES:])
            except HTTPException as exc:
                yield sse_event({"type": "error", "detail": exc.detail})
                return
            assistant_message = {
                "id": uuid.uuid4().hex,
                "role": "assistant",
                "content": text,
                "created_at": now_ms(),
                "model": model,
                "raw_usage": None,
                "raw": raw,
            }
            conversation["messages"].append(assistant_message)
            conversation["updated_at"] = now_ms()
            conversation_service.save_conversation(user_id, conversation)
            yield sse_event({"type": "delta", "delta": text})
            yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

        return StreamingResponse(codex_stream(), media_type="text/event-stream")

    if is_gemini_cli_provider(stream_provider):
        from backend.services.gemini_cli_service import GEMINI_CLI_DEFAULT_CHAT_MODELS, gemini_cli_chat_text

        model = selected_model(payload.model, (stream_provider.get("chat_models") or GEMINI_CLI_DEFAULT_CHAT_MODELS)[0])
        payload.model = model

        async def gemini_cli_stream():
            yield sse_event({"type": "meta", "conversation": conversation})
            try:
                text, raw = await gemini_cli_chat_text(payload, conversation["messages"][-MAX_HISTORY_MESSAGES:])
            except HTTPException as exc:
                yield sse_event({"type": "error", "detail": exc.detail})
                return
            assistant_message = {
                "id": uuid.uuid4().hex,
                "role": "assistant",
                "content": text,
                "created_at": now_ms(),
                "model": model,
                "raw_usage": None,
                "raw": raw,
            }
            conversation["messages"].append(assistant_message)
            conversation["updated_at"] = now_ms()
            conversation_service.save_conversation(user_id, conversation)
            yield sse_event({"type": "delta", "delta": text})
            yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

        return StreamingResponse(gemini_cli_stream(), media_type="text/event-stream")

    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    _stream_provider = get_api_provider(payload.provider) if payload.provider not in {"modelscope"} else {}
    history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
    upstream_messages = [{"role": "system", "content": chat_system_prompt(payload)}]
    for item in history:
        msg = upstream_message_from_record(item)
        if msg:
            upstream_messages.append(msg)

    async def stream():
        content_parts: list[str] = []
        reasoning_parts: list[str] = []
        raw_usage = None
        yield sse_event({"type": "meta", "conversation": conversation})
        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    f"{chat_base}/chat/completions",
                    headers=chat_hdrs,
                    json={"model": model, "messages": upstream_messages, "stream": True},
                ) as response:
                    if response.status_code >= 400:
                        detail = await response.aread()
                        body = detail.decode("utf-8", errors="ignore")
                        friendly = friendly_chat_error_detail(body, model, _stream_provider)
                        yield sse_event({"type": "error", "detail": friendly or f"上游接口错误：{body}"})
                        return
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            line = line[5:].strip()
                        if line == "[DONE]":
                            break
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(chunk, dict) and chunk.get("usage"):
                            raw_usage = chunk.get("usage")
                        delta = text_delta_from_chat_chunk(chunk)
                        if delta:
                            content_parts.append(delta)
                            yield sse_event({"type": "delta", "delta": delta})
                        else:
                            reasoning = reasoning_delta_from_chat_chunk(chunk)
                            if reasoning:
                                reasoning_parts.append(reasoning)
        except httpx.HTTPError as exc:
            yield sse_event({"type": "error", "detail": f"请求上游接口失败：{exc}"})
            return

        final_text = "".join(content_parts).strip() or strip_think_tags("".join(reasoning_parts))
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": final_text or "接口返回了空回复。",
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw_usage,
        }
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        conversation_service.save_conversation(user_id, conversation)
        if final_text and not content_parts:
            # Thinking-only stream: emit once so the UI typewriter can show the answer
            yield sse_event({"type": "delta", "delta": final_text})
        yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

    return StreamingResponse(stream(), media_type="text/event-stream")
