import asyncio
import base64
import json
import math
import mimetypes
import os
import re
import tempfile
import time
import urllib.parse
import uuid

import httpx
from fastapi import HTTPException
from PIL import Image, ImageOps

from backend.config import BASE_DIR, OUTPUT_OUTPUT_DIR
from backend.services.chat_service import MAX_HISTORY_MESSAGES
from backend.services.cli_discovery import codex_cli_executable, gpt_image_2_skill_executable
from backend.services.cli_tools_service import decode_cli_output
from backend.services.image_params_service import ONLINE_IMAGE_REFERENCE_MAX
from backend.services.media_paths import content_type_for_path, output_file_from_url, output_url_for

CODEX_DEFAULT_IMAGE_MODELS = ["gpt-image-2"]
CODEX_DEFAULT_CHAT_MODELS = ["gpt-5.5"]

try:
    CODEX_DEFAULT_TIMEOUT = max(30, min(3600, int(os.getenv("CODEX_CLI_TIMEOUT", "900"))))
except Exception:
    CODEX_DEFAULT_TIMEOUT = 900


def codex_timeout(default=CODEX_DEFAULT_TIMEOUT):
    try:
        return max(30, min(3600, int(os.getenv("CODEX_CLI_TIMEOUT", str(default)) or default)))
    except Exception:
        return default


def codex_model_for_exec(model="", fallback=""):
    value = str(model or fallback or "").strip()
    low = value.lower()
    if not value or low.startswith("$imagegen") or low.startswith("gpt-image"):
        return ""
    return value


async def run_codex_cli(prompt, model="", image_paths=None, timeout=None, output_last_message=True):
    exe = codex_cli_executable()
    if not exe:
        raise HTTPException(status_code=400, detail="未找到 OpenAI Codex CLI。请先安装并完成 codex 登录。")
    image_paths = [str(path) for path in (image_paths or []) if path and os.path.isfile(str(path))]
    last_path = ""
    args = [exe, "exec", "--cd", str(BASE_DIR), "--sandbox", "workspace-write", "--skip-git-repo-check"]
    exec_model = codex_model_for_exec(model)
    if exec_model:
        args.extend(["--model", exec_model])
    for path in image_paths:
        args.extend(["--image", path])
    if output_last_message:
        fd, last_path = tempfile.mkstemp(prefix="codex_last_", suffix=".txt", dir=str(OUTPUT_OUTPUT_DIR))
        os.close(fd)
        args.extend(["--output-last-message", last_path])
    args.append("-")
    prompt_bytes = str(prompt or "").encode("utf-8")
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            cwd=str(BASE_DIR),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(input=prompt_bytes), timeout=timeout or codex_timeout())
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="OpenAI Codex CLI 执行超时。可设置 CODEX_CLI_TIMEOUT 增大等待时间。") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=f"未找到 OpenAI Codex CLI：{exe}") from exc
    out_text, err_text = decode_cli_output(stdout, stderr)
    last_text = ""
    if last_path and os.path.exists(last_path):
        try:
            with open(last_path, "r", encoding="utf-8-sig") as f:
                last_text = f.read().strip()
        except Exception:
            last_text = ""
        try:
            os.remove(last_path)
        except Exception:
            pass
    if proc.returncode != 0:
        message = err_text or out_text or last_text or f"exit={proc.returncode}"
        raise HTTPException(status_code=502, detail=f"OpenAI Codex CLI 调用失败：{message[:1200]}")
    return {"text": last_text or out_text, "_stdout": out_text, "_stderr": err_text}


def codex_output_image_files(since_time=0):
    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    root = os.path.abspath(str(OUTPUT_OUTPUT_DIR))
    files = []
    try:
        for name in os.listdir(root):
            path = os.path.join(root, name)
            if not os.path.isfile(path):
                continue
            if os.path.splitext(name)[1].lower() not in exts:
                continue
            mtime = os.path.getmtime(path)
            if mtime + 1 < float(since_time or 0):
                continue
            files.append((mtime, path))
    except Exception:
        return []
    return [path for _mtime, path in sorted(files, reverse=True)]


def codex_output_url_from_path(path):
    path = os.path.abspath(str(path or ""))
    root = os.path.abspath(str(OUTPUT_OUTPUT_DIR))
    try:
        if os.path.commonpath([root, path]) == root:
            return output_url_for(os.path.basename(path), "output")
    except Exception:
        return ""
    return ""


def _parse_size_pair(size: str) -> tuple[int, int]:
    match = re.match(r"^\s*(\d{2,5})\s*[xX*]\s*(\d{2,5})\s*$", str(size or ""))
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))


def codex_postprocess_image_to_requested_size(path="", requested_size="", provider=""):
    if str(provider or "").strip().lower() not in {"codex", "gemini-cli"}:
        return ""
    width, height = _parse_size_pair(requested_size)
    if not width or not height or not path or not os.path.isfile(path):
        return ""
    try:
        with Image.open(path) as img:
            img.load()
            if img.width == width and img.height == height:
                return ""
            resample = getattr(Image, "Resampling", Image).LANCZOS
            oriented = ImageOps.exif_transpose(img)
            converted = oriented.convert("RGBA") if oriented.mode in ("RGBA", "LA", "P") else oriented.convert("RGB")
            resized = ImageOps.fit(converted, (width, height), method=resample, centering=(0.5, 0.5))
            base, _ext = os.path.splitext(path)
            upscaled_path = f"{base}_upscaled_{width}x{height}.png"
            resized.save(upscaled_path, format="PNG")
            return upscaled_path
    except Exception:
        return ""


def gpt_image_2_skill_auth_file():
    configured = str(os.getenv("GPT_IMAGE_2_SKILL_AUTH_FILE") or os.getenv("CODEX_AUTH_FILE") or "").strip()
    if configured:
        return configured
    candidates = [
        os.path.join(os.getenv("USERPROFILE", ""), ".codex", "auth.json"),
        os.path.join(os.path.expanduser("~"), ".codex", "auth.json"),
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return candidates[0] if candidates and candidates[0] else ""


def gpt_image_2_skill_auth_json(auth_file=""):
    path = str(auth_file or "").strip()
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def gpt_image_2_skill_access_token(auth_data):
    if not isinstance(auth_data, dict):
        return ""
    for key in ("access_token", "accessToken"):
        value = str(auth_data.get(key) or "").strip()
        if value:
            return value
    tokens = auth_data.get("tokens")
    if isinstance(tokens, dict):
        for key in ("access_token", "accessToken"):
            value = str(tokens.get(key) or "").strip()
            if value:
                return value
    return ""


def gpt_image_2_skill_api_key(auth_data=None):
    for key in ("GPT_IMAGE_2_SKILL_API_KEY", "OPENAI_API_KEY"):
        value = str(os.getenv(key, "") or "").strip()
        if value:
            return value
    if isinstance(auth_data, dict):
        value = str(auth_data.get("OPENAI_API_KEY") or auth_data.get("api_key") or auth_data.get("apiKey") or "").strip()
        if value:
            return value
    return ""


def gpt_image_2_skill_provider_args(auth_file=""):
    auth_data = gpt_image_2_skill_auth_json(auth_file)
    if gpt_image_2_skill_access_token(auth_data):
        return (["--provider", "codex", "--auth-file", auth_file] if auth_file else ["--provider", "codex"]), "codex"
    api_key = gpt_image_2_skill_api_key(auth_data)
    if api_key:
        return ["--provider", "openai", "--api-key", api_key], "openai"
    return (["--provider", "codex", "--auth-file", auth_file] if auth_file else ["--provider", "codex"]), "codex"


def gpt_image_2_skill_model_arg(model="", provider="openai"):
    value = str(model or "").strip()
    low = value.lower()
    provider = str(provider or "").strip().lower()
    if provider == "codex":
        if not value or low.startswith("$imagegen") or low.startswith("gpt-image"):
            return "gpt-5.4"
        return value
    if not value or low.startswith("$imagegen"):
        return "gpt-image-2"
    return value


def gpt_image_2_skill_size_arg(size="", model="", prompt="", provider="openai"):
    text = " ".join([str(size or ""), str(model or ""), str(prompt or "")]).lower()
    size_text = str(size or "").strip()
    if str(provider or "").strip().lower() == "codex":
        if "1k" in text or "1024" in text:
            return "1K"
        if "2k" in text or "2048" in text:
            return "2K"
        if "4k" in text or "3840" in text:
            return "4K"
        width, height = _parse_size_pair(size_text)
        if 0 < max(width, height) < 1800:
            return "1K"
        if 1800 <= max(width, height) < 3000:
            return "2K"
        return "4K"
    if "4k" in text or "3840" in text:
        return "4K"
    if "1k" in text or "1024" in text:
        return "1K"
    return "2K"


def gpt_image_2_skill_prompt_arg(prompt="", size="", provider="openai"):
    prompt_text = str(prompt or "").strip()
    if str(provider or "").strip().lower() != "codex":
        return prompt_text
    size_arg = gpt_image_2_skill_size_arg(size, "", prompt, provider)
    return f"{prompt_text} 画质要求：目标输出 {size_arg} 高分辨率图片。"


def parse_gpt_image_2_skill_output(stdout_text="", stderr_text=""):
    items = []
    for line in (stdout_text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except Exception:
            continue
    paths = []
    for item in items:
        if not isinstance(item, dict):
            continue
        for key in ("path", "file", "output", "out", "url"):
            value = str(item.get(key) or "").strip()
            if value:
                paths.append(value)
        for image in item.get("images") or []:
            if isinstance(image, dict):
                for key in ("path", "file", "url"):
                    value = str(image.get(key) or "").strip()
                    if value:
                        paths.append(value)
            else:
                paths.append(str(image))
    pattern = r"([A-Za-z]:\\[^\r\n\"\'<>]+\.(?:png|jpe?g|webp|gif)|/[^\r\n\"\'<>]+\.(?:png|jpe?g|webp|gif))"
    paths.extend(re.findall(pattern, stdout_text or stderr_text or "", flags=re.I))
    return items, paths


async def generate_codex_provider_image_via_gpt_image_2_skill(prompt, size, model, ref_paths=None):
    exe = gpt_image_2_skill_executable()
    if not exe:
        return None
    ref_paths = [str(path) for path in (ref_paths or []) if path and os.path.isfile(str(path))]
    auth_file = gpt_image_2_skill_auth_file()
    provider_args, tool_provider = gpt_image_2_skill_provider_args(auth_file)
    out_path = os.path.join(str(OUTPUT_OUTPUT_DIR), f"gpt_image_2_{uuid.uuid4().hex}.png")
    mode = "edit" if ref_paths else "generate"
    args = [exe, "--json", "--json-events", *provider_args, "images", mode, "--prompt", gpt_image_2_skill_prompt_arg(prompt, size, tool_provider), "--out", out_path, "--model", gpt_image_2_skill_model_arg(model, tool_provider), "--format", "png", "--size", gpt_image_2_skill_size_arg(size, model, prompt, tool_provider), "--quality", "high"]
    for path in ref_paths:
        args.extend(["--ref-image", path])
    if ref_paths and tool_provider == "openai":
        args.extend(["--input-fidelity", "high"])
    try:
        proc = await asyncio.create_subprocess_exec(*args, cwd=str(BASE_DIR), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=codex_timeout())
    except asyncio.TimeoutError as exc:
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
        raise HTTPException(status_code=504, detail="GPT Image 2 Skill 执行超时。") from exc
    except FileNotFoundError:
        return None
    out_text, err_text = decode_cli_output(stdout, stderr)
    if proc.returncode != 0:
        message = err_text or out_text or f"exit={proc.returncode}"
        raise HTTPException(status_code=502, detail=f"GPT Image 2 Skill 调用失败：{message[:1200]}")
    parsed, reported_paths = parse_gpt_image_2_skill_output(out_text, err_text)
    candidate_paths = []
    if os.path.isfile(out_path):
        candidate_paths.append(out_path)
    candidate_paths.extend([path for path in reported_paths if path and os.path.isfile(path)])
    urls = []
    for path in candidate_paths:
        processed_path = codex_postprocess_image_to_requested_size(path, size, tool_provider)
        url = codex_output_url_from_path(processed_path or path)
        if url:
            urls.append(url)
    if not urls:
        status_text = (out_text or err_text or "")[:1200]
        raise HTTPException(status_code=502, detail=f"GPT Image 2 Skill 已返回，但没有在输出目录发现图片：{status_text}")
    return {"type": "url", "value": urls[0]}, {"images": urls, "text": out_text, "provider": "codex", "tool": "gpt-image-2-skill", "tool_provider": tool_provider, "raw": parsed or {"stdout": out_text, "stderr": err_text}}


async def codex_prepare_local_media(ref_url):
    text = str(ref_url or "").strip()
    if not text:
        return "", []
    if text.startswith(("/output/", "/assets/")):
        path = output_file_from_url(text)
        if path:
            return path, []
        raise HTTPException(status_code=404, detail=f"OpenAI CLI 参考素材不存在：{text}")
    if text.startswith("file://"):
        path = urllib.parse.unquote(urllib.parse.urlparse(text).path)
        if os.name == "nt" and re.match(r"^/[A-Za-z]:/", path):
            path = path[1:]
        if os.path.isfile(path):
            return path, []
    if os.path.isfile(text):
        return text, []
    temp_paths = []
    suffix = ".png"
    if text.startswith("data:"):
        if ";base64," not in text:
            raise HTTPException(status_code=400, detail="OpenAI CLI 参考素材 data URL 缺少 base64 数据")
        header, encoded = text.split(";base64,", 1)
        mime = header.split(":", 1)[1].split(";", 1)[0] if ":" in header else ""
        suffix = mimetypes.guess_extension(mime) or suffix
        fd, path = tempfile.mkstemp(prefix="codex_ref_", suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(base64.b64decode(encoded))
        temp_paths.append(path)
        return path, temp_paths
    if text.startswith(("http://", "https://")):
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=300.0, write=60.0, pool=20.0), follow_redirects=True) as client:
            response = await client.get(text)
            response.raise_for_status()
            clean_path = urllib.parse.urlparse(text).path
            suffix = os.path.splitext(clean_path)[1] or mimetypes.guess_extension(response.headers.get("content-type", "")) or suffix
            fd, path = tempfile.mkstemp(prefix="codex_ref_", suffix=suffix)
            with os.fdopen(fd, "wb") as f:
                f.write(response.content)
            temp_paths.append(path)
            return path, temp_paths
    raise HTTPException(status_code=400, detail=f"OpenAI CLI 无法读取参考素材：{text[:120]}")


async def codex_reference_paths(reference_images=None):
    paths = []
    temp_paths = []
    try:
        for ref in (reference_images or [])[:ONLINE_IMAGE_REFERENCE_MAX]:
            url = ref.get("url") if isinstance(ref, dict) else getattr(ref, "url", "")
            if not url:
                continue
            path, created = await codex_prepare_local_media(url)
            if path:
                paths.append(path)
            temp_paths.extend(created)
        return paths, temp_paths
    except Exception:
        for path in temp_paths:
            try:
                os.remove(path)
            except Exception:
                pass
        raise


async def generate_codex_provider_image(prompt, size, model, reference_images=None, provider=None):
    ref_paths, temp_paths = await codex_reference_paths(reference_images)
    try:
        skill_result = await generate_codex_provider_image_via_gpt_image_2_skill(prompt, size, model, ref_paths)
        if skill_result:
            return skill_result
        raise HTTPException(status_code=400, detail="未找到 GPT Image 2 helper，OpenAI CLI 生图不可用。请先安装 gpt-image-2-skill。")
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except Exception:
                pass


def codex_chat_prompt(payload, history_messages=None):
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
    parts.append("请直接回答用户，输出纯文本，不要修改项目文件。")
    return "\n\n".join(part for part in parts if part).strip()


async def codex_chat_text(payload, history_messages=None):
    temp_paths = []
    try:
        image_values = []
        if hasattr(payload, "images"):
            image_values.extend([{"url": item} for item in (getattr(payload, "images", None) or []) if item])
        if hasattr(payload, "reference_images"):
            image_values.extend([ref.model_dump() if hasattr(ref, "model_dump") else ref for ref in (getattr(payload, "reference_images", None) or []) if getattr(ref, "url", "") or (isinstance(ref, dict) and ref.get("url"))])
        image_paths, temp_paths = await codex_reference_paths(image_values)
        raw = await run_codex_cli(
            codex_chat_prompt(payload, history_messages),
            model=getattr(payload, "model", "") or CODEX_DEFAULT_CHAT_MODELS[0],
            image_paths=image_paths,
            timeout=codex_timeout(),
            output_last_message=True,
        )
        text = str(raw.get("text") or "").strip()
        return text or "Codex CLI 返回了空回复。", raw
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except Exception:
                pass
