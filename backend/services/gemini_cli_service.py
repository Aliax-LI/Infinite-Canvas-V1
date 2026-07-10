import asyncio
import json
import os
import re
import time

from fastapi import HTTPException

from backend.config import BASE_DIR, OUTPUT_OUTPUT_DIR
from backend.services.chat_service import MAX_HISTORY_MESSAGES
from backend.services.cli_discovery import gemini_cli_display_name, gemini_cli_executable, is_antigravity_cli
from backend.services.cli_tools_service import decode_cli_output
from backend.services.codex_cli_service import (
    codex_output_image_files,
    codex_output_url_from_path,
    codex_postprocess_image_to_requested_size,
    codex_reference_paths,
)
from backend.services.image_params_service import ONLINE_IMAGE_REFERENCE_MAX

GEMINI_CLI_DEFAULT_IMAGE_MODELS = ["auto"]
GEMINI_CLI_DEFAULT_CHAT_MODELS = ["auto"]

try:
    GEMINI_CLI_DEFAULT_TIMEOUT = max(30, min(3600, int(os.getenv("GEMINI_CLI_TIMEOUT", "900"))))
except Exception:
    GEMINI_CLI_DEFAULT_TIMEOUT = 900


def gemini_cli_timeout(default=GEMINI_CLI_DEFAULT_TIMEOUT):
    try:
        return max(30, min(3600, int(os.getenv("GEMINI_CLI_TIMEOUT", str(default)) or default)))
    except Exception:
        return default


def gemini_cli_image_timeout():
    raw = os.getenv("ANTIGRAVITY_IMAGE_TIMEOUT") or os.getenv("GEMINI_CLI_IMAGE_TIMEOUT") or "300"
    try:
        return max(60, min(1800, int(raw)))
    except Exception:
        return 300


def gemini_cli_model(model="", fallback=""):
    value = str(model or fallback or "").strip()
    return value or "auto"


def gemini_cli_text_from_raw(raw, fallback_text=""):
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, dict):
        for key in ("response", "text", "content", "message", "output"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return str(fallback_text or "").strip()


def gemini_cli_parse_stdout(out_text):
    text = str(out_text or "").strip()
    if not text:
        return {}, ""
    try:
        raw = json.loads(text)
        return raw, gemini_cli_text_from_raw(raw, text)
    except Exception:
        return {"text": text}, text


async def run_gemini_cli(prompt, model="", timeout=None, allow_tools=False):
    exe = gemini_cli_executable()
    if not exe:
        raise HTTPException(status_code=400, detail="未找到 Antigravity CLI。请先安装并完成 agy 登录。")
    timeout_seconds = timeout or gemini_cli_timeout()
    if is_antigravity_cli(exe):
        args = [exe, "--print-timeout", f"{int(timeout_seconds)}s"]
        selected = gemini_cli_model(model)
        if selected and selected != "auto":
            args.extend(["--model", selected])
        if allow_tools:
            args.append("--dangerously-skip-permissions")
        args.extend(["-p", str(prompt or "")])
    else:
        args = [exe, "--model", gemini_cli_model(model), "--output-format", "json", "--skip-trust"]
        if allow_tools:
            args.extend(["--approval-mode", "yolo"])
        args.extend(["--prompt", str(prompt or "")])
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(*args, cwd=str(BASE_DIR), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError as exc:
        if proc and proc.returncode is None:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
        raise HTTPException(status_code=504, detail=f"{gemini_cli_display_name(exe)} 执行超时。") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=f"未找到 {gemini_cli_display_name(exe)}：{exe}") from exc
    out_text, err_text = decode_cli_output(stdout, stderr)
    raw, text = gemini_cli_parse_stdout(out_text)
    if proc.returncode != 0:
        message = err_text or out_text or f"exit={proc.returncode}"
        raise HTTPException(status_code=502, detail=f"{gemini_cli_display_name(exe)} 调用失败：{message[:1200]}")
    return {"text": text or out_text, "raw": raw, "_stdout": out_text, "_stderr": err_text}


def gemini_cli_image_size_instruction(size="", model=""):
    size_text = str(size or "").strip()
    match = re.match(r"^\s*(\d{2,5})\s*[xX*]\s*(\d{2,5})\s*$", size_text)
    if match:
        width, height = int(match.group(1)), int(match.group(2))
        if width > 0 and height > 0:
            return f"目标输出分辨率：{width}x{height} 像素。"
    combined = f"{size_text} {model}".lower()
    if "4k" in combined:
        return "目标输出为 4K 高分辨率图片。"
    if "2k" in combined:
        return "目标输出为 2K 高分辨率图片。"
    return f"尺寸/比例参考：{size_text or 'auto'}。"


async def generate_gemini_cli_provider_image(prompt, size, model, reference_images=None, provider=None):
    ref_paths, temp_paths = await codex_reference_paths(reference_images)
    since = time.time()
    try:
        ref_text = "\n参考图片本地路径：\n" + "\n".join(ref_paths) if ref_paths else ""
        image_prompt = (
            f"你正在为 Infinite Canvas 生成图片。\n任务：{prompt}\n\n"
            f"{gemini_cli_image_size_instruction(size, model)}\n{ref_text}\n\n"
            f"请把最终图片保存到：{OUTPUT_OUTPUT_DIR}\n只输出最终文件路径和一句简短说明。"
        )
        raw = await run_gemini_cli(
            image_prompt,
            model=model or GEMINI_CLI_DEFAULT_IMAGE_MODELS[0],
            timeout=gemini_cli_image_timeout() if is_antigravity_cli(gemini_cli_executable()) else gemini_cli_timeout(),
            allow_tools=True,
        )
        files = codex_output_image_files(since)
        urls = []
        for path in files:
            processed_path = codex_postprocess_image_to_requested_size(path, size, "gemini-cli")
            url = codex_output_url_from_path(processed_path or path)
            if url and url not in urls:
                urls.append(url)
        if not urls:
            status_text = (raw.get("text") or raw.get("_stdout") or "")[:1200]
            raise HTTPException(status_code=502, detail=f"{gemini_cli_display_name()} 已返回，但没有在输出目录发现图片：{status_text}")
        return {"type": "url", "value": urls[0]}, {"images": urls, "text": raw.get("text"), "provider": "gemini-cli", "raw": raw.get("raw")}
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except Exception:
                pass


def gemini_cli_chat_prompt(payload, history_messages=None):
    parts = []
    system_prompt = str(getattr(payload, "system_prompt", "") or "").strip()
    if system_prompt:
        parts.append(f"系统要求：\n{system_prompt}")
    for item in (history_messages or [])[-MAX_HISTORY_MESSAGES:]:
        role = str(item.get("role") or "").strip()
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            label = "用户" if role == "user" else "助手"
            parts.append(f"{label}：\n{content}")
    message = str(getattr(payload, "message", "") or "").strip()
    parts.append(f"用户：\n{message}")
    image_values = []
    if hasattr(payload, "images"):
        image_values.extend([{"url": item} for item in (getattr(payload, "images", None) or []) if item])
    if hasattr(payload, "reference_images"):
        image_values.extend([ref.model_dump() if hasattr(ref, "model_dump") else ref for ref in (getattr(payload, "reference_images", None) or []) if getattr(ref, "url", "") or (isinstance(ref, dict) and ref.get("url"))])
    return "\n\n".join(part for part in parts if part).strip(), image_values


async def gemini_cli_chat_text(payload, history_messages=None):
    temp_paths = []
    try:
        prompt, image_values = gemini_cli_chat_prompt(payload, history_messages)
        image_paths, temp_paths = await codex_reference_paths(image_values)
        if image_paths:
            prompt = f"{prompt}\n\n可参考的本地图片路径：\n" + "\n".join(image_paths)
        prompt = f"{prompt}\n\n请直接回答用户，输出纯文本，不要修改项目文件。"
        raw = await run_gemini_cli(prompt, model=getattr(payload, "model", "") or GEMINI_CLI_DEFAULT_CHAT_MODELS[0], timeout=gemini_cli_timeout(), allow_tools=False)
        text = str(raw.get("text") or "").strip()
        return text or f"{gemini_cli_display_name()} 返回了空回复。", raw
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except Exception:
                pass
