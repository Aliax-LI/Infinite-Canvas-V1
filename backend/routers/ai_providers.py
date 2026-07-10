from fastapi import APIRouter, HTTPException
import httpx

from backend.models.ai_providers import ApiProviderPayload, TestConnectionPayload
from backend.services import api_providers_service, provider_probe_service

router = APIRouter(tags=["ai_providers"])

_PROBE_NOT_MIGRATED = "上游探测与模型拉取尚未迁移，暂不可用"


@router.get("/api/providers")
async def list_providers() -> dict:
    return {"providers": api_providers_service.public_api_providers()}


@router.put("/api/providers")
async def save_providers(payload: list[ApiProviderPayload]) -> dict:
    providers = api_providers_service.save_providers_payload(payload)
    return {"providers": [api_providers_service.public_provider(p) for p in providers]}


@router.post("/api/providers/test-connection")
async def test_provider_connection(payload: TestConnectionPayload) -> dict:
    return await provider_probe_service.test_provider_connection(payload)


@router.post("/api/providers/probe-async")
async def probe_async_endpoint(payload: TestConnectionPayload) -> dict:
    return await provider_probe_service.probe_async_endpoint(payload)


@router.post("/api/providers/fetch-models")
async def fetch_upstream_models_from_payload(payload: TestConnectionPayload) -> dict:
    return await provider_probe_service.fetch_models_from_payload(payload)


@router.get("/api/providers/{provider_id}/fetch-models")
async def fetch_upstream_models(provider_id: str) -> dict:
    return await provider_probe_service.fetch_models_from_provider(provider_id)


@router.get("/api/providers/modelscope/fetch-loras")
async def fetch_modelscope_loras(
    target_model: str = "",
    sub_vision_foundation: str = "",
    page_number: int = 1,
    page_size: int = 16,
    name: str = "",
) -> dict:
    from backend.services.modelscope_dolphin_service import fetch_dolphin_loras

    try:
        return await fetch_dolphin_loras(
            target_model=target_model,
            sub_vision_foundation=sub_vision_foundation,
            page_number=page_number,
            page_size=page_size,
            name=name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"魔搭 LoRA 列表拉取失败：{str(exc)[:200]}") from exc
