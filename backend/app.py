from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import DATABASE_PATH, FRONTEND_DIST_DIR, MIGRATIONS_DIR, ensure_data_dirs
from backend.storage.migration_runner import ensure_schema_current
from backend.routers import ai_config, ai_providers, asset_library, generate, cli_tools, assets, canvas_workflows, canvases, comfyui, deprecated, media, object_assets, projects, prompt_libraries, runninghub, shared_folders, system, websocket, workflows


def create_app() -> FastAPI:
    ensure_data_dirs()
    ensure_schema_current(DATABASE_PATH, MIGRATIONS_DIR)
    app = FastAPI(title="Infinite Canvas Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system.router)
    app.include_router(object_assets.router)
    app.include_router(deprecated.router)
    app.include_router(media.router)
    app.include_router(assets.router)
    app.include_router(asset_library.router)
    app.include_router(prompt_libraries.router)
    app.include_router(shared_folders.router)
    app.include_router(comfyui.router)
    app.include_router(workflows.router)
    app.include_router(runninghub.router)
    app.include_router(ai_providers.router)
    app.include_router(ai_config.router)
    app.include_router(generate.router)
    app.include_router(cli_tools.router)
    app.include_router(canvas_workflows.router)
    app.include_router(canvases.router)
    app.include_router(projects.router)
    app.include_router(websocket.router)

    if FRONTEND_DIST_DIR.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="spa")

    return app
