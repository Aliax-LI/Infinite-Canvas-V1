from fastapi import APIRouter

from backend.services import ai_config_service

router = APIRouter(tags=["ai_config"])


@router.get("/api/config")
async def ai_config() -> dict:
    return ai_config_service.ai_config_payload()


@router.get("/api/models")
async def ai_models() -> dict:
    return ai_config_service.ai_models_payload()


@router.get("/api/config/token")
async def get_global_token() -> dict:
    return ai_config_service.global_token_payload()
