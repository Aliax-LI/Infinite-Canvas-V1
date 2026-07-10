from typing import Any

from pydantic import BaseModel, Field

LLM_MESSAGE_MAX_LENGTH = 20000


class CanvasLLMRequest(BaseModel):
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    system_prompt: str = ""
    model: str = ""
    messages: list[dict[str, Any]] = []
    provider: str = "comfly"
    ms_model: str = ""
    images: list[str] = []
    videos: list[str] = []


class GenerateRequest(BaseModel):
    prompt: str = ""
    width: int = 1024
    height: int = 1024
    workflow_json: str = "Z-Image.json"
    params: dict[str, Any] = {}
    type: str = "zimage"
    client_id: str = ""
    convert_to_jpg: bool = False


class MsGenerateRequest(BaseModel):
    prompt: str
    api_key: str = ""
    model: str = "black-forest-labs/FLUX.2-klein-9B"
    image_urls: list[str] = []
    width: int = 0
    height: int = 0
    size: str = ""
    loras: Any | None = None
    client_id: str | None = None


class AIReference(BaseModel):
    url: str = ""
    name: str = ""
    mime: str = ""
    data: str = ""


class ChatRequest(BaseModel):
    conversation_id: str = ""
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    system_prompt: str = ""
    model: str = ""
    image_model: str = ""
    image_provider: str = ""
    mode: str = "chat"
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: list[AIReference] = []
    provider: str = "comfly"
    ms_model: str = ""


ONLINE_IMAGE_PROMPT_MAX_LENGTH = 8000


class OnlineImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=ONLINE_IMAGE_PROMPT_MAX_LENGTH)
    provider_id: str = "comfly"
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    n: int = 1
    reference_images: list[AIReference] = []


class ImageTaskQueryRequest(BaseModel):
    provider_id: str = "comfly"
    task_id: str = Field(min_length=1, max_length=240)


VIDEO_PROMPT_MAX_LENGTH = 8000


class CanvasVideoRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=VIDEO_PROMPT_MAX_LENGTH)
    provider_id: str = "comfly"
    model: str = "veo3-fast"
    duration: int = 5
    aspect_ratio: str = "16:9"
    resolution: str = ""
    size: str = ""
    images: list[AIReference] = []
    videos: list[str] = []
    audios: list[str] = []
    enhance_prompt: bool = False
    enable_upsample: bool = False
    watermark: bool = False
    seed: int | None = None
    camerafixed: bool = False
    return_last_frame: bool = False
    generate_audio: bool = False
    multimodal: bool = False
    trusted_asset: bool = False


class TempShUploadRequest(BaseModel):
    url: str = ""


class CloudVideoUploadRequest(BaseModel):
    url: str = ""
    service: str = "auto"


class CloudGenRequest(BaseModel):
    prompt: str
    api_key: str = ""
    model: str = ""
    resolution: str = "1024x1024"
    type: str = "zimage"
    image_urls: list[str] = []
    loras: Any | None = None
    client_id: str | None = None


class CloudPollRequest(BaseModel):
    task_id: str
    api_key: str = ""
    client_id: str | None = None
