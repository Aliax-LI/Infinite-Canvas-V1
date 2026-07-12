import json
import os
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException

from backend.models.runninghub import (
    RunningHubSubmitRequest,
    RunningHubUploadAssetRequest,
    RunningHubWorkflowConfig,
    RunningHubWorkflowSubmitRequest,
)
from backend.services import runninghub_service
from backend.services.media_paths import content_type_for_path, rewrite_runninghub_file_url

router = APIRouter(tags=["runninghub"])


@router.get("/api/runninghub/workflows")
async def list_runninghub_workflows() -> dict:
    return {"workflows": runninghub_service.list_runninghub_workflow_items()}


@router.get("/api/runninghub/workflows/{workflow_id:path}")
async def get_runninghub_workflow_route(workflow_id: str) -> dict:
    return {"workflow": runninghub_service.get_runninghub_workflow(workflow_id)}


@router.put("/api/runninghub/workflows/{workflow_id:path}")
async def save_runninghub_workflow_route(workflow_id: str, payload: RunningHubWorkflowConfig) -> dict:
    cfg = runninghub_service.save_runninghub_workflow(workflow_id, payload)
    return {"success": True, "workflow": cfg}


@router.delete("/api/runninghub/workflows/{workflow_id:path}")
async def delete_runninghub_workflow_route(workflow_id: str) -> dict:
    runninghub_service.delete_runninghub_workflow(workflow_id)
    return {"success": True}


@router.get("/api/runninghub/app-info")
async def runninghub_app_info(webappId: str = "") -> dict:
    webapp_id = str(webappId or "").strip()
    if not webapp_id:
        raise HTTPException(status_code=400, detail="webappId 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider)
    url = runninghub_service.runninghub_endpoint_url(
        provider,
        f"/api/webapp/apiCallDemo?apiKey={urllib.parse.quote(api_key)}&webappId={urllib.parse.quote(webapp_id)}",
    )
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=120.0, write=30.0, pool=20.0)) as client:
        try:
            response = await client.get(url, headers=runninghub_service.runninghub_app_headers(False))
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求 RunningHub 应用信息失败：{exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=json.dumps(raw, ensure_ascii=False)[:500])
    if isinstance(raw, dict) and raw.get("code") not in (0, "0", None):
        raise HTTPException(status_code=400, detail=raw.get("msg") or f"RunningHub 查询失败 code={raw.get('code')}")
    return {"success": True, "data": (raw.get("data") if isinstance(raw, dict) else {}) or {}}


@router.post("/api/runninghub/submit")
async def runninghub_submit(payload: RunningHubSubmitRequest) -> dict:
    webapp_id = str(payload.webappId or "").strip()
    if not webapp_id:
        raise HTTPException(status_code=400, detail="webappId 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider, use_wallet=payload.useWallet)
    body = {
        "apiKey": api_key,
        "webappId": webapp_id,
        "nodeInfoList": runninghub_service.sanitize_runninghub_node_info_list(payload.nodeInfoList or []),
    }
    if str(payload.instanceType or "").strip():
        body["instanceType"] = payload.instanceType.strip()
    url = runninghub_service.runninghub_endpoint_url(provider, "/task/openapi/ai-app/run")
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=180.0, write=120.0, pool=20.0)) as client:
        try:
            response = await client.post(url, headers=runninghub_service.runninghub_app_headers(True, payload.useWallet), json=body)
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"提交 RunningHub 任务失败：{exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=json.dumps(raw, ensure_ascii=False)[:800])
    if isinstance(raw, dict) and raw.get("code") in (0, "0"):
        task_id = raw.get("data", {}).get("taskId") if isinstance(raw.get("data"), dict) else ""
        if task_id:
            return {"success": True, "data": {"taskId": task_id, "raw": raw}}
    raise HTTPException(status_code=400, detail=(raw.get("msg") if isinstance(raw, dict) else "") or f"RunningHub 提交失败：{raw}")


@router.post("/api/runninghub/workflow-submit")
async def runninghub_workflow_submit(payload: RunningHubWorkflowSubmitRequest) -> dict:
    workflow_id = str(payload.workflowId or "").strip()
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflowId 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider, use_wallet=payload.useWallet)
    body = {"apiKey": api_key, "workflowId": workflow_id, "addMetadata": True}
    if payload.nodeInfoList:
        body["nodeInfoList"] = runninghub_service.sanitize_runninghub_node_info_list(payload.nodeInfoList)
    if payload.workflow:
        body["workflow"] = json.dumps(payload.workflow, ensure_ascii=False) if isinstance(payload.workflow, (dict, list)) else str(payload.workflow)
    url = runninghub_service.runninghub_endpoint_url(provider, "/task/openapi/create")
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=180.0, write=120.0, pool=20.0)) as client:
        try:
            response = await client.post(url, headers=runninghub_service.runninghub_app_headers(True, payload.useWallet), json=body)
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"提交 RunningHub 工作流失败：{exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=json.dumps(raw, ensure_ascii=False)[:800])
    if isinstance(raw, dict) and raw.get("code") in (0, "0"):
        task_id = raw.get("data", {}).get("taskId") if isinstance(raw.get("data"), dict) else ""
        if task_id:
            return {"success": True, "data": {"taskId": task_id, "raw": raw}}
    raise HTTPException(status_code=400, detail=(raw.get("msg") if isinstance(raw, dict) else "") or f"RunningHub 工作流提交失败：{raw}")


@router.get("/api/runninghub/workflow-info")
async def runninghub_workflow_info(workflowId: str = "") -> dict:
    workflow_id = str(workflowId or "").strip()
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflowId 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider)
    url = runninghub_service.runninghub_endpoint_url(provider, "/api/openapi/getJsonApiFormat")
    body = {"apiKey": api_key, "workflowId": workflow_id}
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=180.0, write=60.0, pool=20.0)) as client:
        try:
            response = await client.post(url, headers=runninghub_service.runninghub_app_headers(True), json=body)
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"拉取 RunningHub 工作流参数失败：{exc}") from exc
    if response.status_code >= 400 or not isinstance(raw, dict) or raw.get("code") not in (0, "0"):
        raise HTTPException(status_code=400, detail=(raw.get("msg") if isinstance(raw, dict) else "") or "RunningHub 工作流参数拉取失败")
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}
    prompt = data.get("prompt")
    workflow_json = json.loads(prompt) if isinstance(prompt, str) and prompt.strip() else (prompt if isinstance(prompt, dict) else {})
    return {"success": True, "data": {"workflowId": workflow_id, "nodeInfoList": runninghub_service.runninghub_workflow_node_info_list(workflow_json), "raw": raw}}


@router.post("/api/runninghub/workflows/fetch")
async def fetch_runninghub_workflow(payload: RunningHubWorkflowConfig) -> dict:
    workflow_id = runninghub_service.runninghub_workflow_store_key(payload.workflowId)
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflowId 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider)
    url = runninghub_service.runninghub_endpoint_url(provider, "/api/openapi/getJsonApiFormat")
    body = {"apiKey": api_key, "workflowId": workflow_id}
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=180.0, write=60.0, pool=20.0)) as client:
        try:
            response = await client.post(url, headers=runninghub_service.runninghub_app_headers(True), json=body)
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch RunningHub workflow parameters: {exc}") from exc
    if response.status_code >= 400 or not isinstance(raw, dict) or raw.get("code") not in (0, "0"):
        raise HTTPException(status_code=400, detail=(raw.get("msg") if isinstance(raw, dict) else "") or "RunningHub workflow fetch failed")
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}
    prompt = data.get("prompt")
    workflow_json = json.loads(prompt) if isinstance(prompt, str) and prompt.strip() else (prompt if isinstance(prompt, dict) else {})
    fields = runninghub_service.runninghub_collect_workflow_fields(workflow_json)
    return {"success": True, "data": {"workflowId": workflow_id, "title": payload.title or workflow_id, "description": payload.description or "", "fields": fields, "workflowJson": workflow_json, "raw": raw}}


@router.get("/api/runninghub/query")
async def runninghub_query(taskId: str = "") -> dict:
    task_id = str(taskId or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="taskId 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider)
    url = runninghub_service.runninghub_endpoint_url(provider, "/task/openapi/outputs")
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=240.0, write=30.0, pool=20.0)) as client:
        try:
            response = await client.post(url, headers=runninghub_service.runninghub_app_headers(True), json={"apiKey": api_key, "taskId": task_id})
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"查询 RunningHub 任务失败：{exc}") from exc
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=json.dumps(raw, ensure_ascii=False)[:800])
        code = raw.get("code") if isinstance(raw, dict) else None
        status = "SUCCESS" if code in (0, "0") else "RUNNING" if code in (804, "804") else "QUEUED" if code in (813, "813") else "FAILED" if code in (805, "805") else "UNKNOWN"
        urls = []
        image_items = []
        if status == "SUCCESS":
            for remote in runninghub_service.runninghub_extract_outputs(raw.get("data")):
                try:
                    local_url = await runninghub_service.runninghub_store_remote_output(client, remote)
                except (OSError, httpx.HTTPError):
                    local_url = remote
                urls.append(local_url)
                image_items.append(runninghub_service.image_output_meta(local_url))
        return {"success": True, "data": {"status": status, "urls": urls, "image_items": image_items, "failReason": runninghub_service.runninghub_fail_reason(raw), "code": code, "raw": raw}}


@router.post("/api/runninghub/upload-asset")
async def runninghub_upload_asset(payload: RunningHubUploadAssetRequest) -> dict:
    source_url = rewrite_runninghub_file_url(str(payload.url or "").strip())
    if not source_url:
        raise HTTPException(status_code=400, detail="url 必填")
    provider = runninghub_service.runninghub_provider()
    api_key = runninghub_service.runninghub_api_key(provider, use_wallet=payload.useWallet)
    filename = "asset.bin"
    content_type = "application/octet-stream"
    content = b""
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=240.0, write=240.0, pool=20.0), follow_redirects=True) as client:
        path = runninghub_service.runninghub_local_asset_path(source_url)
        if path:
            filename, content_type, content = runninghub_service.read_local_asset_file(source_url)
        elif source_url.startswith(("http://", "https://")):
            response = await client.get(source_url)
            if not response.is_success:
                raise HTTPException(status_code=400, detail=f"下载素材失败 HTTP {response.status_code}")
            content = response.content
            content_type = response.headers.get("content-type") or content_type
            filename = os.path.basename(urllib.parse.urlsplit(source_url).path) or filename
        else:
            raise HTTPException(status_code=400, detail=f"不支持的素材地址：{source_url}")
        if not content:
            raise HTTPException(status_code=400, detail="素材为空，无法上传到 RunningHub")
        upload_url = runninghub_service.runninghub_endpoint_url(provider, "/task/openapi/upload")
        try:
            response = await client.post(upload_url, headers=runninghub_service.runninghub_app_headers(False, payload.useWallet), data={"apiKey": api_key, "fileType": "input"}, files={"file": (filename, content, content_type)})
            raw = response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"上传素材到 RunningHub 失败：{exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=json.dumps(raw, ensure_ascii=False)[:800])
    if isinstance(raw, dict) and raw.get("code") in (0, "0") and isinstance(raw.get("data"), dict) and raw["data"].get("fileName"):
        return {"success": True, "data": {"fileName": raw["data"]["fileName"], "fileType": raw["data"].get("fileType") or content_type}}
    raise HTTPException(status_code=400, detail=(raw.get("msg") if isinstance(raw, dict) else "") or f"RunningHub 上传失败：{raw}")
