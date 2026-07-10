import re

from fastapi import APIRouter, HTTPException

from backend.models.comfyui import ComfyInstancesPayload
from backend.services import comfyui_client
from backend.services.env_helper import update_env_values

router = APIRouter(tags=["comfyui"])


@router.get("/api/comfyui/instances")
async def get_comfyui_instances() -> dict:
    return {"instances": comfyui_client.comfyui_instances()}


@router.get("/api/comfyui/status")
async def get_comfyui_status(instances: str | None = None) -> dict:
    if instances is not None:
        raw = [s.strip() for s in instances.split(",") if s.strip()]
        return comfyui_client.probe_comfyui_instances(raw)
    return comfyui_client.probe_comfyui_instances()


@router.put("/api/comfyui/instances")
async def save_comfyui_instances(payload: ComfyInstancesPayload) -> dict:
    cleaned: list[str] = []
    for item in payload.instances:
        s = str(item or "").strip()
        if not s:
            continue
        s = re.sub(r"^https?://", "", s).rstrip("/")
        if ":" not in s:
            raise HTTPException(status_code=400, detail=f"地址缺少端口号：{item}（应为 host:port，例如 127.0.0.1:8188）")
        host, _, port = s.rpartition(":")
        if not host or not port.isdigit():
            raise HTTPException(status_code=400, detail=f"地址不合法：{item}（应为 host:port，例如 127.0.0.1:8188）")
        if s not in cleaned:
            cleaned.append(s)
    if not cleaned:
        raise HTTPException(status_code=400, detail="至少保留一个 ComfyUI 后端地址")
    try:
        update_env_values({"COMFYUI_INSTANCES": ",".join(cleaned)})
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"写入 env 失败：{exc}") from exc
    instances = comfyui_client.set_comfyui_instances(cleaned)
    return {"instances": instances}
