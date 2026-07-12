import os

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.models.assets import (
    AssetAvatarRegisterRequest,
    AssetAnnotationSettingsRequest,
    AssetLibraryAddRequest,
    AssetLibraryAnnotateRequest,
    AssetLibraryBatchAddRequest,
    AssetLibraryBatchCropRequest,
    AssetLibraryBatchDeleteRequest,
    AssetLibraryBatchMoveRequest,
    AssetLibraryCategoryRequest,
    AssetLibraryClassifyRequest,
    AssetLibraryRenameRequest,
    AssetLibraryRequest,
    AssetLibraryTagsRequest,
)
from backend.services import asset_library_service
from backend.services.media_paths import output_file_from_url

router = APIRouter(tags=["asset-library"])


def _resolve_annotation_params(payload_provider: str = "", payload_model: str = "", payload_ms_model: str = "", payload_prompt: str = ""):
    from backend.services import app_preferences_service
    from backend.services.api_providers_service import get_primary_provider_id

    saved = app_preferences_service.asset_annotation_settings()
    provider = str(payload_provider or saved.get("provider") or "").strip() or get_primary_provider_id()
    model = str(payload_model or saved.get("model") or "").strip()
    ms_model = str(payload_ms_model or saved.get("ms_model") or "").strip()
    prompt = str(payload_prompt or saved.get("prompt") or "").strip()
    return provider, model, ms_model, prompt


async def _annotate_library_item(lib: dict, item: dict, *, provider: str, model: str, ms_model: str, prompt: str) -> dict:
    from backend.services import local_assets_ai_service
    from backend.services.media_paths import asset_library_media_kind, output_file_from_url

    if asset_library_media_kind(item.get("url") or "") != "image" and item.get("kind") != "image":
        raise HTTPException(status_code=400, detail="仅支持图片素材智能标注")
    path = output_file_from_url(item.get("url") or "")
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    classification = await local_assets_ai_service.classify_image_with_provider(path, provider, model, ms_model, prompt)
    asset_library_service.apply_classification_to_item(item, classification)
    return item


@router.get("/api/asset-library/annotation-settings")
async def get_asset_annotation_settings() -> dict:
    from backend.services import app_preferences_service

    return {"settings": app_preferences_service.asset_annotation_settings()}


@router.patch("/api/asset-library/annotation-settings")
async def update_asset_annotation_settings(payload: AssetAnnotationSettingsRequest) -> dict:
    from backend.services import app_preferences_service

    prefs = app_preferences_service.load_app_preferences()
    prefs["asset_annotation"] = {
        "provider": str(payload.provider or "").strip(),
        "model": str(payload.model or "").strip(),
        "ms_model": str(payload.ms_model or "").strip(),
        "prompt": str(payload.prompt or "").strip(),
    }
    app_preferences_service.save_app_preferences(prefs)
    return {"settings": prefs["asset_annotation"]}


@router.post("/api/asset-library/libraries")
async def create_asset_library(payload: AssetLibraryRequest) -> dict:
    from backend.services.media_paths import sanitize_asset_name

    lib = asset_library_service.load_asset_library()
    library = {
        "id": f"lib_{__import__('uuid').uuid4().hex[:12]}",
        "name": sanitize_asset_name(payload.name, "资产库"),
        "type": "asset",
        "categories": [],
    }
    library["categories"].append({"id": f"cat_{__import__('uuid').uuid4().hex[:12]}", "name": "默认分组", "type": "image", "items": []})
    library["categories"].append({"id": f"wf_{__import__('uuid').uuid4().hex[:12]}", "name": "工作流", "type": "workflow", "items": []})
    lib.setdefault("libraries", []).append(library)
    lib["active_library_id"] = library["id"]
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "asset_library": library}


@router.patch("/api/asset-library/libraries/{library_id}")
async def rename_asset_library(library_id: str, payload: AssetLibraryRenameRequest) -> dict:
    from backend.services.media_paths import sanitize_asset_name

    lib = asset_library_service.load_asset_library()
    library = asset_library_service.find_asset_library(lib, library_id)
    if not library or library.get("id") != library_id:
        raise HTTPException(status_code=404, detail="资产库不存在")
    library["name"] = sanitize_asset_name(payload.name, library.get("name") or "资产库")
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "asset_library": library}


@router.delete("/api/asset-library/libraries/{library_id}")
async def delete_asset_library(library_id: str) -> dict:
    lib = asset_library_service.load_asset_library()
    libraries = lib.get("libraries") or []
    if len(libraries) <= 1:
        raise HTTPException(status_code=400, detail="至少保留一个资产库")
    if not any(item.get("id") == library_id for item in libraries):
        raise HTTPException(status_code=404, detail="资产库不存在")
    lib["libraries"] = [item for item in libraries if item.get("id") != library_id]
    if lib.get("active_library_id") == library_id:
        lib["active_library_id"] = lib["libraries"][0].get("id")
    asset_library_service.save_asset_library(lib)
    return {"library": lib}


@router.post("/api/asset-library/categories")
async def create_asset_library_category(payload: AssetLibraryCategoryRequest) -> dict:
    from backend.config import ASSET_LIBRARY_DIR
    from backend.services.media_paths import sanitize_asset_name

    lib = asset_library_service.load_asset_library()
    library = asset_library_service.find_asset_library(lib, payload.library_id)
    if not library:
        raise HTTPException(status_code=404, detail="资产库不存在")
    cat_type = "workflow" if str(payload.type or "").lower() == "workflow" else "image"
    category = {
        "id": f"cat_{__import__('uuid').uuid4().hex[:12]}",
        "name": sanitize_asset_name(payload.name, "新文件夹"),
        "type": cat_type,
        "items": [],
    }
    if cat_type == "image":
        category["dir"] = asset_library_service.unique_asset_category_dir(library, payload.name)
        os.makedirs(os.path.join(str(ASSET_LIBRARY_DIR), category["dir"]), exist_ok=True)
    library.setdefault("categories", []).append(category)
    lib["active_library_id"] = library.get("id") or lib.get("active_library_id")
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "category": category}


@router.patch("/api/asset-library/categories/{category_id}")
async def rename_asset_library_category(category_id: str, payload: AssetLibraryRenameRequest) -> dict:
    from backend.services.media_paths import sanitize_asset_name

    lib = asset_library_service.load_asset_library()
    _, cat = asset_library_service.find_asset_category_with_library(lib, category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    cat["name"] = sanitize_asset_name(payload.name, cat.get("name") or "新文件夹")
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "category": cat}


@router.delete("/api/asset-library/categories/{category_id}")
async def delete_asset_library_category(category_id: str, library_id: str = "") -> dict:
    import shutil
    from backend.config import ASSET_LIBRARY_DIR

    lib = asset_library_service.load_asset_library()
    library, cat = asset_library_service.find_asset_category_with_library(lib, category_id, library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") == "workflow" and category_id == "workflows" and (library.get("id") or "") == "default":
        raise HTTPException(status_code=400, detail="默认工作流分类不能删除")
    for item in cat.get("items") or []:
        asset_library_service.remove_asset_library_file(item)
    cat_dir = str(cat.get("dir") or "").strip("/").strip()
    if cat_dir:
        target = os.path.join(str(ASSET_LIBRARY_DIR), cat_dir)
        root = os.path.abspath(str(ASSET_LIBRARY_DIR))
        if os.path.isdir(target) and os.path.abspath(target).startswith(root + os.sep):
            shutil.rmtree(target, ignore_errors=True)
    library["categories"] = [c for c in library.get("categories", []) if c.get("id") != category_id]
    asset_library_service.save_asset_library(lib)
    return {"library": lib}


@router.post("/api/asset-library/items")
async def add_asset_library_item(payload: AssetLibraryAddRequest) -> dict:
    lib = asset_library_service.load_asset_library()
    cat = asset_library_service.find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    src = output_file_from_url(payload.url)
    if not src:
        raise HTTPException(status_code=400, detail="只支持保存本地 /assets 或 /output 媒体")
    _, item = asset_library_service.make_asset_library_item(src, payload.name or os.path.basename(src), subdir=cat.get("dir") or "")
    cat.setdefault("items", []).append(item)
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "item": item}


@router.post("/api/asset-library/items/batch")
async def batch_add_asset_library_items(payload: AssetLibraryBatchAddRequest) -> dict:
    added = []
    lib = asset_library_service.load_asset_library()
    cat = asset_library_service.find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    for entry in (payload.items or [])[:200]:
        src = output_file_from_url(entry.url)
        if not src:
            continue
        _, item = asset_library_service.make_asset_library_item(src, entry.name or os.path.basename(src), subdir=cat.get("dir") or "")
        cat.setdefault("items", []).append(item)
        added.append(item)
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "items": added}


@router.patch("/api/asset-library/items/{item_id}")
async def rename_asset_library_item(item_id: str, payload: AssetLibraryRenameRequest) -> dict:
    from backend.services.media_paths import sanitize_asset_name

    lib = asset_library_service.load_asset_library()
    for library in lib.get("libraries", []):
        for cat in library.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    item["name"] = sanitize_asset_name(payload.name, item.get("name") or "asset")
                    asset_library_service.save_asset_library(lib)
                    return {"library": lib, "item": item}
    raise HTTPException(status_code=404, detail="资产不存在")


@router.delete("/api/asset-library/items/{item_id}")
async def delete_asset_library_item(item_id: str) -> dict:
    lib = asset_library_service.load_asset_library()
    removed = None
    for library in lib.get("libraries", []):
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    removed = item
                else:
                    keep.append(item)
            cat["items"] = keep
    if not removed:
        raise HTTPException(status_code=404, detail="资产不存在")
    asset_library_service.remove_asset_library_file(removed)
    asset_library_service.save_asset_library(lib)
    return {"library": lib}


@router.post("/api/asset-library/items/delete")
async def batch_delete_asset_library_items(payload: AssetLibraryBatchDeleteRequest) -> dict:
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = asset_library_service.load_asset_library()
    removed = 0
    removed_items = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    removed += 1
                    removed_items.append(item)
                else:
                    keep.append(item)
            cat["items"] = keep
    for item in removed_items:
        asset_library_service.remove_asset_library_file(item)
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "removed": removed}


@router.post("/api/asset-library/items/move")
async def batch_move_asset_library_items(payload: AssetLibraryBatchMoveRequest) -> dict:
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = asset_library_service.load_asset_library()
    target_cat = asset_library_service.find_asset_category_in_library(lib, payload.target_category_id, payload.target_library_id)
    if not target_cat:
        raise HTTPException(status_code=404, detail="目标分组不存在")
    target_type = target_cat.get("type") or "image"
    moved = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            if (cat.get("type") or "image") != target_type:
                continue
            keep = []
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    moved.append(item)
                else:
                    keep.append(item)
            cat["items"] = keep
    existing_ids = {item.get("id") for item in target_cat.get("items", [])}
    for item in moved:
        if item.get("id") not in existing_ids:
            target_cat.setdefault("items", []).append(item)
            existing_ids.add(item.get("id"))
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "moved": len(moved)}


@router.post("/api/asset-library/items/crop")
async def batch_crop_asset_library_items(payload: AssetLibraryBatchCropRequest) -> dict:
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = asset_library_service.load_asset_library()
    lib, added = asset_library_service.batch_crop_library_items(
        lib,
        ids=ids,
        library_id=payload.library_id or "",
        target_category_id=payload.target_category_id or "",
        target_library_id=payload.target_library_id or "",
    )
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "added": len(added), "items": added}


@router.patch("/api/asset-library/items/{item_id}/tags")
async def update_asset_library_item_tags(item_id: str, payload: AssetLibraryTagsRequest) -> dict:
    lib = asset_library_service.load_asset_library()
    item = asset_library_service.find_asset_item_in_library(lib, item_id, payload.library_id)
    if not item:
        raise HTTPException(status_code=404, detail="资产不存在")
    asset_library_service.set_item_tags(item, payload.tags or [])
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "item": item}


@router.post("/api/asset-library/items/{item_id}/annotate")
async def annotate_asset_library_item(item_id: str, payload: AssetLibraryAnnotateRequest) -> dict:
    lib = asset_library_service.load_asset_library()
    item = asset_library_service.find_asset_item_in_library(lib, item_id, payload.library_id)
    if not item:
        raise HTTPException(status_code=404, detail="资产不存在")
    provider, model, ms_model, prompt = _resolve_annotation_params(
        payload.provider, payload.model, payload.ms_model, payload.prompt
    )
    try:
        await _annotate_library_item(lib, item, provider=provider, model=model, ms_model=ms_model, prompt=prompt)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(getattr(exc, "detail", "") or exc)) from exc
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "item": item}


@router.post("/api/asset-library/items/classify")
async def classify_asset_library_items(payload: AssetLibraryClassifyRequest) -> dict:
    from backend.services.media_paths import asset_library_media_kind, output_file_from_url

    lib = asset_library_service.load_asset_library()
    provider, model, ms_model, prompt = _resolve_annotation_params(
        payload.provider, payload.model, payload.ms_model, payload.prompt
    )
    results, changed = [], False
    for item_id in (payload.ids or [])[:80]:
        item = asset_library_service.find_asset_item_in_library(lib, item_id, payload.library_id)
        result = {"id": item_id, "ok": False, "classification": None, "error": ""}
        if not item:
            result["error"] = "资产不存在"
            results.append(result)
            continue
        if asset_library_media_kind(item.get("url") or "") != "image" and item.get("kind") != "image":
            result["error"] = "仅支持图片素材智能分类"
            results.append(result)
            continue
        path = output_file_from_url(item.get("url") or "")
        if not path or not os.path.isfile(path):
            result["error"] = "文件不存在"
            results.append(result)
            continue
        try:
            await _annotate_library_item(lib, item, provider=provider, model=model, ms_model=ms_model, prompt=prompt)
            changed = True
            result.update({"ok": True, "classification": item.get("classification")})
        except HTTPException as exc:
            result["error"] = str(exc.detail)
        except Exception as exc:
            result["error"] = str(getattr(exc, "detail", "") or exc)
        results.append(result)
    if changed:
        asset_library_service.save_asset_library(lib)
    return {"library": lib, "count": sum(1 for item in results if item.get("ok")), "items": results}


@router.post("/api/asset-library/items/{item_id}/register-avatar")
async def register_asset_library_avatar(item_id: str, payload: AssetAvatarRegisterRequest) -> dict:
    from backend.services import avatar_service
    return await avatar_service.register_asset_library_avatar(item_id, payload)


@router.post("/api/asset-library/items/{item_id}/avatar-status")
async def check_asset_library_avatar(item_id: str, payload: AssetAvatarRegisterRequest) -> dict:
    from backend.services import avatar_service
    return await avatar_service.check_asset_library_avatar(item_id, payload)


@router.post("/api/asset-library/workflows/upload")
async def upload_asset_library_workflows(
    files: list[UploadFile] = File(...),
    library_id: str = Form(""),
    category_id: str = Form(""),
) -> dict:
    lib = asset_library_service.load_asset_library()
    _, cat = asset_library_service.asset_library_workflow_category(lib, library_id, category_id)
    added = []
    for file in files[:100]:
        raw = await file.read()
        filename = file.filename or "canvas-workflow.zip"
        lower = filename.lower()
        if not (lower.endswith(".json") or lower.endswith(".zip") or raw[:2] == b"PK"):
            continue
        item = asset_library_service.make_workflow_library_item_from_bytes(raw, filename, os.path.splitext(filename)[0])
        cat.setdefault("items", []).append(item)
        added.append(item)
    if not added:
        raise HTTPException(status_code=400, detail="没有可上传的工作流文件")
    asset_library_service.save_asset_library(lib)
    return {"library": lib, "items": added}
