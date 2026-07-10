import os
from typing import Any

from fastapi import APIRouter

from backend.models.cli_tools import (
    CodexHelpRequest,
    GeminiCliHelpRequest,
    JimengHelpRequest,
    JimengQueryMediaRequest,
)
from backend.services import cli_tools_service, jimeng_cli_service
from backend.services.cli_discovery import gpt_image_2_skill_executable

router = APIRouter(tags=["cli_tools"])


def _test_cli_status_mock(panel: str) -> dict[str, Any] | None:
    if os.getenv("INFINITE_CANVAS_TEST") != "1":
        return None
    if os.getenv("INFINITE_CANVAS_TEST_CLI_INSTALLED") != "1":
        return None
    if panel == "codex":
        return {
            "installed": True,
            "logged_in": None,
            "version": "electron-test-codex",
            "path": "/usr/local/bin/codex",
            "message": "OpenAI Codex CLI 已安装。",
            "image2_helper_installed": True,
            "image2_helper_path": "/usr/local/bin/gpt-image-2",
        }
    if panel == "gemini":
        return {
            "installed": True,
            "logged_in": None,
            "version": "electron-test-gemini",
            "path": "/usr/local/bin/gemini",
            "provider": "antigravity",
            "message": "Antigravity CLI 已安装。",
        }
    if panel == "jimeng":
        return {
            "installed": True,
            "logged_in": False,
            "message": "请先登录",
            "cli_version": "1.4.2",
            "version_ok": True,
            "min_version": "1.4.2",
            "path": "/usr/local/bin/dreamina",
        }
    return None


@router.get("/api/codex/status")
async def codex_status_route() -> dict:
    forced = _test_cli_status_mock("codex")
    if forced is not None:
        return forced
    return await cli_tools_service.codex_status()


@router.post("/api/codex/install-image-helper")
async def codex_install_image_helper() -> dict:
    exe = gpt_image_2_skill_executable()
    if exe:
        return {
            "success": True,
            "installed": True,
            "path": exe,
            "message": "GPT Image 2 helper 已安装，无需重复安装。",
        }
    return {
        "success": False,
        "installed": False,
        "message": "GPT Image 2 helper 安装流程尚未迁移，请手动安装。",
    }


@router.post("/api/codex/help")
async def codex_help_route(payload: CodexHelpRequest) -> dict:
    return await cli_tools_service.codex_help(str(payload.command or "").strip())


@router.get("/api/gemini-cli/status")
async def gemini_cli_status_route() -> dict:
    forced = _test_cli_status_mock("gemini")
    if forced is not None:
        return forced
    return await cli_tools_service.gemini_cli_status()


@router.post("/api/gemini-cli/help")
async def gemini_cli_help_route(payload: GeminiCliHelpRequest) -> dict:
    return await cli_tools_service.gemini_cli_help(str(payload.command or "").strip())


@router.get("/api/jimeng/status")
async def jimeng_status_route() -> dict:
    forced = _test_cli_status_mock("jimeng")
    if forced is not None:
        return forced
    return await jimeng_cli_service.jimeng_status()


@router.get("/api/jimeng/credit")
async def jimeng_credit() -> dict:
    return await jimeng_cli_service.jimeng_credit()


@router.post("/api/jimeng/logout")
async def jimeng_logout() -> dict:
    return await jimeng_cli_service.jimeng_logout()


@router.post("/api/jimeng/login/start")
async def jimeng_login_start() -> dict:
    return await jimeng_cli_service.jimeng_login_start()


@router.get("/api/jimeng/login/status")
async def jimeng_login_status() -> dict:
    return await jimeng_cli_service.jimeng_login_status()


@router.post("/api/jimeng/help")
async def jimeng_help_route(payload: JimengHelpRequest) -> dict:
    return await jimeng_cli_service.jimeng_help(str(payload.command or "").strip())


@router.post("/api/jimeng/query-media")
async def jimeng_query_media(payload: JimengQueryMediaRequest) -> dict:
    return await jimeng_cli_service.jimeng_query_media(payload.submit_id, payload.kind)
