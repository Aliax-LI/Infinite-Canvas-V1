from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request

from backend.models.conversations import ConversationCreateRequest
from backend.models.generate import CanvasLLMRequest, CanvasVideoRequest, ChatRequest, CloudGenRequest, CloudPollRequest, CloudVideoUploadRequest, GenerateRequest, ImageTaskQueryRequest, MsGenerateRequest, OnlineImageRequest, TempShUploadRequest
from backend.models.history import BatchDeleteHistoryRequest, DeleteHistoryRequest, PurgeHistoryRequest
from backend.services import angle_service, canvas_video_service, chat_service, cloud_upload_service, comfy_generate_service, conversation_service, history_service, image_params_service, ms_generate_service, online_image_service
from backend.services.request_guard import ensure_same_origin_request

router = APIRouter(tags=["generate"])

def _safe_user_id(header_value: str, request: Request) -> str:
    value = str(header_value or request.headers.get("x-user-id") or "").strip()
    return value or "default"


@router.get("/api/image-params")
async def image_params(provider_id: str = "", model: str = "") -> dict[str, Any]:
    return image_params_service.image_params_payload(provider_id, model)


@router.post("/api/online-image")
async def online_image(payload: OnlineImageRequest) -> dict:
    return await online_image_service.build_online_image_result(payload)


@router.post("/api/image-task-query")
async def image_task_query(payload: ImageTaskQueryRequest) -> dict:
    return await online_image_service.query_image_task(payload)


@router.post("/api/canvas-image-tasks")
async def canvas_image_tasks(payload: OnlineImageRequest) -> dict:
    return online_image_service.create_canvas_image_task(payload)


@router.get("/api/canvas-image-tasks/{task_id}")
async def get_canvas_image_task(task_id: str) -> dict:
    return online_image_service.get_canvas_image_task(task_id)


@router.post("/api/canvas-comfy-tasks")
async def canvas_comfy_tasks(payload: GenerateRequest) -> dict:
    return online_image_service.create_canvas_comfy_task(payload)


@router.get("/api/canvas-comfy-tasks/{task_id}")
async def get_canvas_comfy_task(task_id: str) -> dict:
    return online_image_service.get_canvas_comfy_task(task_id)


@router.post("/api/canvas-video")
async def canvas_video(payload: CanvasVideoRequest) -> dict:
    return await canvas_video_service.canvas_video(payload)


@router.post("/api/canvas-llm")
async def canvas_llm(payload: CanvasLLMRequest) -> dict:
    return await chat_service.canvas_llm(payload)


@router.post("/api/temp-sh/upload")
async def temp_sh_upload(payload: TempShUploadRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    return await cloud_upload_service.upload_local_video_to_cloud(payload.url, "auto")


@router.post("/api/cloud-video/upload")
async def cloud_video_upload(payload: CloudVideoUploadRequest, request: Request) -> dict:
    ensure_same_origin_request(request)
    return await cloud_upload_service.upload_local_video_to_cloud(payload.url, payload.service)


@router.get("/api/conversations")
async def conversations(request: Request, x_user_id: str = Header(default="")) -> dict:
    user_id = _safe_user_id(x_user_id, request)
    return {"user_id": user_id, "conversations": conversation_service.list_conversations(user_id)}


@router.post("/api/conversations")
async def create_conversation(
    payload: ConversationCreateRequest,
    request: Request,
    x_user_id: str = Header(default=""),
) -> dict:
    user_id = _safe_user_id(x_user_id, request)
    return {"conversation": conversation_service.new_conversation(user_id, payload.title)}


@router.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")) -> dict:
    user_id = _safe_user_id(x_user_id, request)
    return {"conversation": conversation_service.load_conversation(user_id, conversation_id)}


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")) -> dict:
    user_id = _safe_user_id(x_user_id, request)
    conversation_service.delete_conversation(user_id, conversation_id)
    return {"ok": True}

@router.post("/api/chat")
async def chat(payload: ChatRequest, request: Request, x_user_id: str = Header(default="")) -> dict:
    user_id = _safe_user_id(x_user_id, request)
    return await chat_service.chat_endpoint(payload, user_id)


@router.post("/api/chat/agent")
async def chat_agent(payload: ChatRequest, request: Request, x_user_id: str = Header(default="")) -> dict:
    user_id = _safe_user_id(x_user_id, request)
    return await chat_service.chat_agent_endpoint(payload, user_id)


@router.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _safe_user_id(x_user_id, request)
    return await chat_service.chat_stream_endpoint(payload, user_id)


@router.get("/api/history")
async def get_history_api(type: str | None = None) -> list:
    return history_service.list_history(type)


@router.get("/api/queue_status")
async def get_queue_status(client_id: str = "") -> dict:
    return comfy_generate_service.queue_status(client_id)


@router.post("/api/history/delete")
async def delete_history(payload: DeleteHistoryRequest) -> dict:
    return history_service.delete_history(payload.timestamp)


@router.post("/api/history/delete-batch")
async def delete_history_batch(payload: BatchDeleteHistoryRequest) -> dict:
    return history_service.delete_history_batch(payload.timestamps)


@router.post("/api/history/purge-missing")
async def purge_missing_history(payload: PurgeHistoryRequest = PurgeHistoryRequest()) -> dict:
    return history_service.purge_missing_history(payload.type)


@router.post("/api/angle/poll_status")
async def angle_poll_status(payload: CloudPollRequest) -> dict:
    return await angle_service.poll_angle_status(payload)


@router.post("/api/angle/generate")
async def angle_generate(payload: CloudGenRequest) -> dict:
    return await angle_service.angle_generate(payload)


@router.post("/api/ms/generate")
async def ms_generate(payload: MsGenerateRequest) -> dict:
    return await ms_generate_service.ms_generate(payload)


@router.post("/api/generate")
async def generate(payload: GenerateRequest) -> dict:
    return comfy_generate_service.comfy_generate(payload)

