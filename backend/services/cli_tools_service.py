import asyncio

from fastapi import HTTPException

from backend.config import BASE_DIR
from backend.services.cli_discovery import (
    codex_cli_executable,
    gemini_cli_display_name,
    gemini_cli_executable,
    gpt_image_2_skill_executable,
    is_antigravity_cli,
    jimeng_cli_executable,
)


def decode_cli_output(stdout: bytes | None, stderr: bytes | None) -> tuple[str, str]:
    out_text = (stdout or b"").decode("utf-8", errors="replace").strip()
    err_text = (stderr or b"").decode("utf-8", errors="replace").strip()
    return out_text, err_text


async def codex_status() -> dict:
    exe = codex_cli_executable()
    image2_exe = gpt_image_2_skill_executable()
    if not exe:
        return {
            "installed": False,
            "logged_in": False,
            "image2_helper_installed": bool(image2_exe),
            "image2_helper_path": image2_exe,
            "message": "未找到 OpenAI Codex CLI，请先安装。",
        }
    try:
        proc = await asyncio.create_subprocess_exec(
            exe,
            "--version",
            cwd=str(BASE_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        out_text, err_text = decode_cli_output(stdout, stderr)
        ok = proc.returncode == 0
        helper_message = (
            "GPT Image 2 helper 已安装，OpenAI CLI 生图会使用 GPT Image 2。"
            if image2_exe
            else "未找到 GPT Image 2 helper，OpenAI CLI 生图不可用。"
        )
        return {
            "installed": ok,
            "logged_in": None,
            "version": out_text or err_text,
            "path": exe,
            "image2_helper_installed": bool(image2_exe),
            "image2_helper_path": image2_exe,
            "message": (
                f"OpenAI Codex CLI 已安装。{helper_message}"
                if ok
                else (err_text or out_text or "Codex CLI 检测失败")
            ),
            "raw": {"stdout": out_text, "stderr": err_text, "returncode": proc.returncode},
        }
    except Exception as exc:
        return {
            "installed": False,
            "logged_in": False,
            "path": exe,
            "image2_helper_installed": bool(image2_exe),
            "image2_helper_path": image2_exe,
            "message": f"Codex CLI 检测失败：{exc}",
        }


async def codex_help(command: str) -> dict:
    exe = codex_cli_executable()
    if not exe:
        raise HTTPException(status_code=400, detail="未找到 OpenAI Codex CLI。")
    allowed = {"", "exec", "login", "logout", "doctor", "mcp", "app", "update"}
    if command not in allowed:
        raise HTTPException(status_code=400, detail="不允许的 Codex CLI 命令")
    args = [exe]
    if command:
        args.append(command)
    args.append("--help")
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=str(BASE_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
    out_text, err_text = decode_cli_output(stdout, stderr)
    if proc.returncode != 0:
        raise HTTPException(status_code=502, detail=(err_text or out_text or f"exit={proc.returncode}")[:1000])
    return {"text": out_text or err_text, "raw": {"stdout": out_text, "stderr": err_text}}


async def gemini_cli_status() -> dict:
    exe = gemini_cli_executable()
    display_name = gemini_cli_display_name(exe)
    if not exe:
        return {
            "installed": False,
            "logged_in": False,
            "provider": "antigravity",
            "message": "未找到 Antigravity CLI，请先安装。",
        }
    try:
        proc = await asyncio.create_subprocess_exec(
            exe,
            "--version",
            cwd=str(BASE_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        out_text, err_text = decode_cli_output(stdout, stderr)
        ok = proc.returncode == 0
        is_agy = is_antigravity_cli(exe)
        return {
            "installed": ok,
            "logged_in": None,
            "version": out_text or err_text,
            "path": exe,
            "provider": "antigravity" if is_agy else "gemini",
            "message": (
                f"{display_name} 已安装。"
                if ok
                else (err_text or out_text or f"{display_name} 检测失败")
            ),
            "raw": {"stdout": out_text, "stderr": err_text, "returncode": proc.returncode},
        }
    except Exception as exc:
        return {
            "installed": False,
            "logged_in": False,
            "path": exe,
            "provider": "antigravity" if is_antigravity_cli(exe) else "gemini",
            "message": f"{display_name} 检测失败：{exc}",
        }


async def gemini_cli_help(command: str) -> dict:
    exe = gemini_cli_executable()
    if not exe:
        raise HTTPException(status_code=400, detail="未找到 Antigravity CLI。")
    is_agy = is_antigravity_cli(exe)
    allowed = (
        {"", "help", "install", "models", "plugin", "plugins", "update", "changelog"}
        if is_agy
        else {"", "help", "mcp", "extensions"}
    )
    if command not in allowed:
        raise HTTPException(status_code=400, detail=f"不允许的 {gemini_cli_display_name(exe)} 命令")
    args = [exe]
    if command:
        args.append(command)
    args.append("--help")
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=str(BASE_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
    out_text, err_text = decode_cli_output(stdout, stderr)
    if proc.returncode != 0:
        raise HTTPException(status_code=502, detail=(err_text or out_text or f"exit={proc.returncode}")[:1000])
    return {"text": out_text or err_text, "raw": {"stdout": out_text, "stderr": err_text}}


async def jimeng_status() -> dict:
    from backend.services import jimeng_cli_service
    return await jimeng_cli_service.jimeng_status()
