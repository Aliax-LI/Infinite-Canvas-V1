import logging
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VERSION_FILE = BASE_DIR / "VERSION"
DESKTOP_BUILD_ID_FILE = BASE_DIR / "DESKTOP_BUILD_ID"
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

_logger = logging.getLogger("infinite_canvas.storage")
_STORAGE_ROOTS_LOGGED = False


def _env_path(key: str) -> Path | None:
    raw = os.getenv(key, "").strip()
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def _resolve_under_data(env_key: str, relative: str, *, legacy: Path | None = None) -> Path:
    """Prefer explicit env, else DATA_DIR/relative; fall back to legacy path if still in use."""
    explicit = _env_path(env_key)
    if explicit is not None:
        return explicit
    candidate = (DATA_DIR / relative).resolve()
    if legacy is not None:
        legacy_resolved = legacy.expanduser().resolve()
        if not candidate.exists() and legacy_resolved.exists():
            return legacy_resolved
    return candidate


DATA_DIR = _env_path("INFINITE_CANVAS_DATA_DIR") or (BASE_DIR / "data").resolve()
DATABASE_PATH = _env_path("INFINITE_CANVAS_DATABASE_PATH") or (DATA_DIR / "infinite-canvas.db").resolve()
MIGRATIONS_DIR = Path(__file__).resolve().parent / "storage" / "migrations"
API_ENV_FILE = _env_path("INFINITE_CANVAS_API_ENV_FILE") or (BASE_DIR / "API" / ".env").resolve()
# Bundled workflow templates live in-repo; packaged Electron overrides to DATA_DIR/workflows.
WORKFLOW_DIR = _env_path("INFINITE_CANVAS_WORKFLOW_DIR") or (BASE_DIR / "workflows").resolve()
CANVAS_DIR = DATA_DIR / "canvases"
PROJECTS_PATH = DATA_DIR / "projects.json"
MEDIA_PREVIEW_DIR = DATA_DIR / "media_previews"
PROMPT_LIBRARY_PATH = DATA_DIR / "prompt_libraries.json"
ASSET_LIBRARY_PATH = DATA_DIR / "asset_library.json"
SHARED_FOLDERS_PATH = DATA_DIR / "shared_folders.json"
CONVERSATION_DIR = DATA_DIR / "conversations"
HISTORY_PATH = DATA_DIR / "history.json"

# Object store is the canonical media tree under Settings「数据目录」.
OBJECTS_DIR = _env_path("INFINITE_CANVAS_OBJECTS_DIR") or (DATA_DIR / "objects").resolve()
# Legacy ASSETS_DIR aliases OBJECTS_DIR so /assets/* and ObjectStore share one tree.
# Repo-root assets/ is retained as a read-only fallback for older local installs.
_LEGACY_ASSETS = (BASE_DIR / "assets").resolve()
ASSETS_DIR = _env_path("INFINITE_CANVAS_ASSETS_DIR") or OBJECTS_DIR
LEGACY_ASSETS_DIR = _LEGACY_ASSETS if _LEGACY_ASSETS != ASSETS_DIR.resolve() else None
OUTPUT_DIR = _env_path("INFINITE_CANVAS_OUTPUT_DIR") or (DATA_DIR / "output").resolve()
_LEGACY_OUTPUT = (BASE_DIR / "output").resolve()
LEGACY_OUTPUT_DIR = _LEGACY_OUTPUT if _LEGACY_OUTPUT != OUTPUT_DIR else None
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
APP_SECRETS_PATH = DATA_DIR / "app_secrets.json"
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
LOCAL_IMAGE_IMPORT_MAX_BYTES = int(os.getenv("LOCAL_IMAGE_IMPORT_MAX_BYTES", str(50 * 1024 * 1024)))
LOCAL_IMAGE_IMPORT_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

CANVAS_COLORS = {"", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink", "slate"}


def resolve_storage_backend() -> str:
    """Pick json vs sqlite: explicit env > post-migration marker > legacy JSON > sqlite."""
    explicit = os.getenv("INFINITE_CANVAS_STORAGE_BACKEND", "").strip().lower()
    if explicit in ("json", "sqlite"):
        return explicit
    if (DATA_DIR / ".sqlite_migration_complete").is_file():
        return "sqlite"
    backend_file = DATA_DIR / "storage_backend"
    if backend_file.is_file() and backend_file.read_text(encoding="utf-8").strip().lower() == "sqlite":
        return "sqlite"
    legacy_files = (
        PROJECTS_PATH,
        ASSET_LIBRARY_PATH,
        PROMPT_LIBRARY_PATH,
        API_PROVIDERS_PATH,
        SHARED_FOLDERS_PATH,
        HISTORY_PATH,
        RUNNINGHUB_WORKFLOW_STORE_PATH,
    )
    if any(path.is_file() for path in legacy_files):
        return "json"
    if CANVAS_DIR.is_dir() and any(CANVAS_DIR.glob("*.json")):
        return "json"
    if CONVERSATION_DIR.is_dir() and any(CONVERSATION_DIR.rglob("*.json")):
        return "json"
    return "sqlite"


STORAGE_BACKEND = resolve_storage_backend()

VOLCENGINE_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
VOLCENGINE_DEFAULT_PROJECT_NAME = "default"
VOLCENGINE_DEFAULT_REGION = "cn-beijing"


def log_storage_roots_once() -> None:
    """Log the Settings「数据目录」root and derived paths once per process."""
    global _STORAGE_ROOTS_LOGGED
    if _STORAGE_ROOTS_LOGGED:
        return
    _STORAGE_ROOTS_LOGGED = True
    legacy = str(LEGACY_ASSETS_DIR) if LEGACY_ASSETS_DIR else "(none)"
    legacy_out = str(LEGACY_OUTPUT_DIR) if LEGACY_OUTPUT_DIR else "(none)"
    _logger.info(
        "storage root (Settings 数据目录)=%s objects=%s assets=%s output=%s "
        "legacy_assets=%s legacy_output=%s backend=%s",
        DATA_DIR,
        OBJECTS_DIR,
        ASSETS_DIR,
        OUTPUT_DIR,
        legacy,
        legacy_out,
        STORAGE_BACKEND,
    )


def ensure_data_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CANVAS_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    CONVERSATION_DIR.mkdir(parents=True, exist_ok=True)
    OBJECTS_DIR.mkdir(parents=True, exist_ok=True)
    for sub in ("input", "output", "uploads", "library", "previews"):
        (OBJECTS_DIR / sub).mkdir(parents=True, exist_ok=True)
    # Pull repo-root assets/ (and empty legacy output/) into DATA_DIR once per process.
    from backend.storage.legacy_media_migrate import migrate_legacy_media_once

    migrate_legacy_media_once()
    log_storage_roots_once()


def _bootstrap_api_env() -> None:
    from backend.services.env_helper import ensure_runtime_config_files, load_env_file
    from backend.services.secrets_service import bootstrap_secrets

    ensure_runtime_config_files()
    load_env_file()
    bootstrap_secrets()


_bootstrap_api_env()
