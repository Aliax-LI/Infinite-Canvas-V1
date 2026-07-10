import base64
import json
import re
from io import BytesIO

import httpx
from fastapi import HTTPException
from PIL import Image

from backend.services.api_providers_service import get_api_provider, get_primary_provider_id
from backend.services.chat_service import (
    AI_REQUEST_TIMEOUT,
    friendly_chat_error_detail,
    is_apimart_provider,
    is_codex_provider,
    is_gemini_cli_provider,
    resolve_chat_provider,
    selected_model,
    text_from_chat_response,
)
from backend.services.common import now_ms
from backend.services.local_assets_service import local_upload_classification_path
from backend.services.media_paths import content_type_for_path

ASSET_CLASSIFICATION_PROMPT = """请识别这张图片，输出严格 JSON，不要 Markdown，不要解释。
目标是给素材库做非常全面的筛选分类。所有字段都用中文短标签数组，尽量具体但不要虚构。
JSON 结构：
{
  "summary": "一句话描述",
  "categories": {
    "environment": ["室内/室外/自然/城市/棚拍/商业空间等环境大类"],
    "scene": ["室内/室外/棚拍/街景/自然/商业空间等"],
    "space": ["卧室/餐厅/客厅/厨房/浴室/办公室/店铺/展厅/户外道路等"],
    "subject": ["人物/模特/产品/家具/建筑/食物/动物/车辆/植物等"],
    "model": ["无人/单人模特/多人模特/男性模特/女性模特/儿童模特/半身模特/全身模特/手部模特等"],
    "people": ["无人/单人/多人/男性/女性/儿童/半身/全身/手部特写等"],
    "style": ["写实/摄影/插画/3D/极简/奢华/复古/现代/电商/电影感等"],
    "lighting": ["自然光/硬光/柔光/逆光/侧光/夜景/暖光/冷光/高对比/低对比等"],
    "color": ["白色/黑色/暖色/冷色/高饱和/低饱和/莫兰迪/金属色等"],
    "composition": ["近景/中景/远景/俯拍/仰拍/正面/侧面/居中/留白/对称/特写等"],
    "mood": ["温馨/高级/清爽/科技/自然/浪漫/神秘/活力/安静等"],
    "use_case": ["广告/电商主图/海报/社媒/样机/参考图/背景/角色参考/空间参考等"],
    "objects": ["画面中重要物体"],
    "materials": ["木材/金属/玻璃/布料/皮革/石材/陶瓷等"],
    "quality": ["高清/模糊/低清/噪点/水印/截图/透明背景等"]
  },
  "tags": ["综合关键词，20个以内"]
}
要求：只返回可解析 JSON；每个数组最多 8 项；如果不确定就省略该标签。"""

ASSET_CLASSIFICATION_DIMENSION_NAMES = {
    "environment": "环境", "scene": "场景", "space": "空间", "subject": "主体",
    "model": "模特", "people": "人物", "style": "风格", "lighting": "光影",
    "color": "色彩", "composition": "构图", "mood": "氛围", "use_case": "用途",
    "objects": "物体", "materials": "材质", "quality": "质量",
}


def _safe_asset_tag(value, limit=24):
    text = re.sub(r"\s+", " ", str(value or "").strip())
    text = re.sub(r"^[#＃]+", "", text).strip(" ,，、;；|/")
    return text[:limit]


def normalize_asset_classification(raw):
    if not isinstance(raw, dict):
        raw = {}
    categories = raw.get("categories") if isinstance(raw.get("categories"), dict) else {}
    clean_categories, flat = {}, []
    for key, values in categories.items():
        norm_key = re.sub(r"[^A-Za-z0-9_-]+", "_", str(key or "").strip().lower())[:40]
        if not norm_key:
            continue
        if isinstance(values, str):
            values = re.split(r"[,，、/|;；\n]+", values)
        if not isinstance(values, list):
            continue
        clean_values, seen = [], set()
        for value in values:
            tag = _safe_asset_tag(value)
            if not tag or tag in seen:
                continue
            seen.add(tag)
            clean_values.append(tag)
            flat.append({"dimension": norm_key, "label": ASSET_CLASSIFICATION_DIMENSION_NAMES.get(norm_key, norm_key), "tag": tag})
            if len(clean_values) >= 8:
                break
        if clean_values:
            clean_categories[norm_key] = clean_values
    tags = raw.get("tags") if isinstance(raw.get("tags"), list) else []
    clean_tags, seen_tags = [], set()
    for value in tags:
        tag = _safe_asset_tag(value)
        if not tag or tag in seen_tags:
            continue
        seen_tags.add(tag)
        clean_tags.append(tag)
        flat.append({"dimension": "tags", "label": "标签", "tag": tag})
        if len(clean_tags) >= 20:
            break
    seen_flat, flat_unique = set(), []
    for item in flat:
        key = f"{item['dimension']}::{item['tag']}"
        if key in seen_flat:
            continue
        seen_flat.add(key)
        flat_unique.append(item)
    return {
        "summary": str(raw.get("summary") or "").strip()[:240],
        "categories": clean_categories,
        "tags": clean_tags,
        "flat": flat_unique,
        "updated_at": now_ms(),
    }


def parse_asset_classification_text(text: str) -> dict:
    value = str(text or "").strip()
    if not value:
        return normalize_asset_classification({})
    value = re.sub(r"^```(?:json)?\s*", "", value, flags=re.IGNORECASE).strip()
    value = re.sub(r"\s*```$", "", value).strip()
    try:
        data = json.loads(value)
    except Exception:
        match = re.search(r"\{.*\}", value, re.S)
        data = json.loads(match.group(0)) if match else {}
    return normalize_asset_classification(data)


def asset_classification_prompt(extra_prompt: str = "") -> str:
    extra = str(extra_prompt or "").strip()
    if not extra:
        return ASSET_CLASSIFICATION_PROMPT
    return ASSET_CLASSIFICATION_PROMPT + "\n\n用户补充分类要求：\n" + extra[:4000]


def image_path_to_data_url(path: str, max_size: int = 1024) -> str:
    if max_size:
        try:
            with Image.open(path) as img:
                img.load()
                if max(img.size) > max_size:
                    img.thumbnail((max_size, max_size), Image.LANCZOS)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGB")
                buf = BytesIO()
                fmt = "PNG" if img.mode == "RGBA" else "JPEG"
                img.save(buf, format=fmt, quality=88 if fmt == "JPEG" else None)
                encoded = base64.b64encode(buf.getvalue()).decode("ascii")
                mime = "image/png" if fmt == "PNG" else "image/jpeg"
                return f"data:{mime};base64,{encoded}"
        except Exception:
            pass
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{content_type_for_path(path)};base64,{encoded}"


def write_local_upload_classification(filename: str, classification: dict) -> None:
    path = local_upload_classification_path(filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(normalize_asset_classification(classification), f, ensure_ascii=False, indent=2)


async def caption_image_with_provider(abs_path, prompt, provider_id, model, ms_model=""):
    llm_provider = get_api_provider(provider_id) if provider_id not in {"modelscope"} else {}
    if is_codex_provider(llm_provider):
        from backend.services.codex_cli_service import CODEX_DEFAULT_CHAT_MODELS, codex_chat_text

        class _Payload:
            pass

        payload = _Payload()
        payload.message = (prompt or "描述图片").strip() or "描述图片"
        payload.model = selected_model(model, (llm_provider.get("chat_models") or CODEX_DEFAULT_CHAT_MODELS)[0])
        payload.system_prompt = ""
        payload.images = [image_path_to_data_url(abs_path, max_size=1024)]
        payload.reference_images = []
        text, raw = await codex_chat_text(payload, [])
        return text, payload.model
    if is_gemini_cli_provider(llm_provider):
        from backend.services.gemini_cli_service import GEMINI_CLI_DEFAULT_CHAT_MODELS, gemini_cli_chat_text

        class _Payload:
            pass

        payload = _Payload()
        payload.message = (prompt or "描述图片").strip() or "描述图片"
        payload.model = selected_model(model, (llm_provider.get("chat_models") or GEMINI_CLI_DEFAULT_CHAT_MODELS)[0])
        payload.system_prompt = ""
        payload.images = [image_path_to_data_url(abs_path, max_size=1024)]
        payload.reference_images = []
        text, raw = await gemini_cli_chat_text(payload, [])
        return text, payload.model
    chat_base, chat_hdrs, resolved_model = resolve_chat_provider(provider_id, model, ms_model)
    is_apimart = is_apimart_provider(llm_provider)
    prompt_text = (prompt or "描述图片").strip() or "描述图片"
    data_url = image_path_to_data_url(abs_path, max_size=1024)
    messages = [{"role": "user", "content": [{"type": "text", "text": prompt_text}, {"type": "image_url", "image_url": {"url": data_url}}]}]
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            req_body = {"model": resolved_model, "messages": messages}
            if is_apimart:
                req_body["stream"] = False
            response = await client.post(f"{chat_base}/chat/completions", headers=chat_hdrs, json=req_body)
            response.raise_for_status()
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text or ""
        friendly = friendly_chat_error_detail(body, resolved_model, llm_provider)
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or f"上游接口错误：{body}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    text = text_from_chat_response(raw).strip() if isinstance(raw, dict) else ""
    return text or "接口返回了空回复。", resolved_model


async def classify_image_with_provider(abs_path, provider_id="", model="", ms_model="", prompt=""):
    provider = provider_id or get_primary_provider_id()
    text, resolved_model = await caption_image_with_provider(abs_path, asset_classification_prompt(prompt), provider, model, ms_model)
    classification = parse_asset_classification_text(text)
    classification["model"] = resolved_model
    classification["provider"] = provider
    return classification
