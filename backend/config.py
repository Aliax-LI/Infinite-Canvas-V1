import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VERSION_FILE = BASE_DIR / "VERSION"
DESKTOP_BUILD_ID_FILE = BASE_DIR / "DESKTOP_BUILD_ID"
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

DATA_DIR = Path(os.getenv("INFINITE_CANVAS_DATA_DIR", str(BASE_DIR / "data"))).expanduser().resolve()
API_ENV_FILE = Path(
    os.getenv("INFINITE_CANVAS_API_ENV_FILE", str(BASE_DIR / "API" / ".env"))
).expanduser().resolve()
WORKFLOW_DIR = BASE_DIR / "workflows"
CANVAS_DIR = DATA_DIR / "canvases"
PROJECTS_PATH = DATA_DIR / "projects.json"
MEDIA_PREVIEW_DIR = DATA_DIR / "media_previews"
PROMPT_LIBRARY_PATH = DATA_DIR / "prompt_libraries.json"
ASSET_LIBRARY_PATH = DATA_DIR / "asset_library.json"
SHARED_FOLDERS_PATH = DATA_DIR / "shared_folders.json"
CONVERSATION_DIR = DATA_DIR / "conversations"

OUTPUT_DIR = BASE_DIR / "output"
ASSETS_DIR = BASE_DIR / "assets"
OUTPUT_INPUT_DIR = ASSETS_DIR / "input"
OUTPUT_OUTPUT_DIR = ASSETS_DIR / "output"
ASSET_LIBRARY_DIR = ASSETS_DIR / "library"
LOCAL_UPLOAD_DIR = ASSETS_DIR / "uploads"

PROMPT_TEMPLATE_CANDIDATES = [
    BASE_DIR / "static" / "system-prompts" / "infinite-canvas-prompt-templates.md",
    BASE_DIR / "history" / "static" / "system-prompts" / "infinite-canvas-prompt-templates.md",
]

GITHUB_REPO_URL = "https://github.com/Aliax-LI/Infinite-Canvas-V1"
API_PROVIDERS_PATH = DATA_DIR / "api_providers.json"
RUNNINGHUB_WORKFLOW_STORE_PATH = DATA_DIR / "runninghub_workflows.json"
RUNNINGHUB_DEFAULT_BASE_URL = "https://www.runninghub.cn"
STATIC_RUNNINGHUB_API_PROVIDERS_FILE = BASE_DIR / "history" / "static" / "runninghub" / "api_providers.json"

RUNNINGHUB_OPENAPI_BASE_URL = "https://www.runninghub.cn/openapi/v2"
RUNNINGHUB_MODEL_REGISTRY_URL = "https://raw.githubusercontent.com/HM-RunningHub/ComfyUI_RH_OpenAPI/main/models_registry.json"
RUNNINGHUB_LLM_MODELS_URLS = [
    "https://llm.runninghub.cn/v1/models",
    "https://llm.runninghub.ai/v1/models",
]
STATIC_RUNNINGHUB_MODEL_REGISTRY_FILE = BASE_DIR / "history" / "static" / "runninghub" / "models_registry.json"
RUNNINGHUB_FALLBACK_CHAT_MODELS = [
    "google/gemini-3.1-flash-lite-preview",
    "qwen/qwen3-vl-235b-a22b-instruct",
    "qwen/qwen-plus",
    "openai/gpt-5.1",
]
RUNNINGHUB_DEFAULT_IMAGE_MODELS = [
    "gpt-image-2.0/text-to-image-channel-low-price",
    "gpt-image-2.0/edit-channel-low-price",
    "gpt-image-2/text-to-image-official-stable",
    "gpt-image-2/image-to-image-official-stable",
    "nano-banana/text-to-image-official-stable",
    "nano-banana/edit-official-stable",
]
RUNNINGHUB_DEFAULT_VIDEO_MODELS = [
    "google/veo3.1-fast/text-to-video-channel-low-price",
    "sora-2/text-to-video-official-stable",
    "seedance-2.0-global/text-to-video",
    "seedance-2.0-global/image-to-video",
]
RUNNINGHUB_FILE_HOST_REWRITES = {
    "rh-images-1252422369.cos.ap-beijing.myqcloud.com": "rh-images.xiaoyaoyou.com",
}
COMFYUI_INSTANCES = [s.strip() for s in os.getenv("COMFYUI_INSTANCES", "127.0.0.1:8188").split(",") if s.strip()]
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

DEFAULT_PROJECT_ID = "default"
CANVAS_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
LOCAL_IMAGE_IMPORT_MAX_BYTES = int(__import__('os').getenv('LOCAL_IMAGE_IMPORT_MAX_BYTES', str(50 * 1024 * 1024)))
LOCAL_IMAGE_IMPORT_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}

CANVAS_COLORS = {"", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink", "slate"}


def ensure_data_dirs() -> None:
    CANVAS_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    CONVERSATION_DIR.mkdir(parents=True, exist_ok=True)
