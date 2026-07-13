import json
import os
import random
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from threading import Lock
from typing import Any

import requests

from backend.config import COMFYUI_INSTANCES, WORKFLOW_DIR
from backend.models.generate import GenerateRequest
from backend.services.comfyui_client import comfyui_instances, upload_image_to_comfyui
from backend.services.history_service import append_history_record
from backend.services.media_paths import output_path_for, output_url_for, sanitize_export_filename
from backend.services.workflow_service import workflow_path_from_name

CLIENT_ID = str(uuid.uuid4())
QUEUE_LOCK = Lock()
LOAD_LOCK = Lock()
QUEUE: list[dict] = []
NEXT_TASK_ID = 1
BACKEND_LOCAL_LOAD: dict[str, int] = {}

COMFYUI_HISTORY_TIMEOUT = int(float(os.getenv("COMFYUI_HISTORY_TIMEOUT", "1800")))
COMFYUI_DOWNLOAD_TIMEOUT = float(os.getenv("COMFYUI_DOWNLOAD_TIMEOUT", "120"))

# AIO Aux Preprocessor values for Z-Image ControlNet Union (comfyui_controlnet_aux).
# Keys must match NODE_CLASS_MAPPINGS / AIO_Preprocessor combo exactly
# (e.g. mlsd → "M-LSDPreprocessor", not "MLSDPreprocessor").
ZIMAGE_CONTROL_PREPROCESSORS: dict[str, str] = {
    "canny": "CannyEdgePreprocessor",
    "depth": "DepthAnythingV2Preprocessor",
    "pose": "OpenposePreprocessor",
    "hed": "HEDPreprocessor",
    "mlsd": "M-LSDPreprocessor",
}
ZIMAGE_CONTROL_PREPROCESSOR_TO_ID = {v: k for k, v in ZIMAGE_CONTROL_PREPROCESSORS.items()}
ZIMAGE_NATIVE_CANNY_PREPROCESSORS = {"CannyEdgePreprocessor", "canny"}

MEDIA_INPUT_KEYS = ("image", "video", "audio", "mask", "filename", "file")
MEDIA_INPUT_EXT_RE = re.compile(r"\.(png|jpe?g|webp|gif|bmp|tiff?|mp4|webm|mov|m4v|avi|mkv|mp3|wav|m4a|aac|ogg|flac)(?:\?|$)", re.I)


def queue_status(client_id: str = "") -> dict[str, int]:
    with QUEUE_LOCK:
        total = len(QUEUE)
        positions = [i + 1 for i, task in enumerate(QUEUE) if task.get("client_id") == client_id]
        position = positions[0] if positions else 0
    return {"total": total, "position": position}


def is_comfy_input_media_value(input_name: str, value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    key = str(input_name or "").lower()
    if any(token in key for token in MEDIA_INPUT_KEYS):
        return True
    return bool(MEDIA_INPUT_EXT_RE.search(value))


def collect_required_comfy_media(params: dict[str, Any]) -> list[str]:
    required = []
    for node_inputs in (params or {}).values():
        if not isinstance(node_inputs, dict):
            continue
        for input_name, value in node_inputs.items():
            if is_comfy_input_media_value(input_name, value):
                required.append(value)
    return list(dict.fromkeys(required))


def check_images_exist(backend_addr: str, images: list[str] | None) -> bool:
    if not images:
        return True
    for img in images:
        try:
            url = f"http://{backend_addr}/view?filename={urllib.parse.quote(img)}&type=input"
            resp = requests.get(url, stream=True, timeout=0.5)
            resp.close()
            if resp.status_code != 200:
                return False
        except Exception:
            return False
    return True


def reserve_best_backend(required_images: list[str] | None = None) -> str:
    instances = comfyui_instances() or list(COMFYUI_INSTANCES)
    backend_stats: dict[str, dict] = {}
    for addr in instances:
        try:
            with urllib.request.urlopen(f"http://{addr}/queue", timeout=1) as response:
                data = json.loads(response.read())
                remote_load = len(data.get("queue_running", [])) + len(data.get("queue_pending", []))
                has_images = check_images_exist(addr, required_images)
                backend_stats[addr] = {"remote_load": remote_load, "has_images": has_images}
        except Exception:
            continue
    with LOAD_LOCK:
        best_backend = instances[0]
        min_load = float("inf")
        if backend_stats:
            for addr, stats in backend_stats.items():
                load = max(stats["remote_load"], BACKEND_LOCAL_LOAD.get(addr, 0))
                if load < min_load or (
                    load == min_load
                    and stats.get("has_images")
                    and not backend_stats.get(best_backend, {}).get("has_images")
                ):
                    min_load = load
                    best_backend = addr
        BACKEND_LOCAL_LOAD[best_backend] = BACKEND_LOCAL_LOAD.get(best_backend, 0) + 1
        return best_backend


def release_backend_load(target_backend: str | None) -> None:
    if not target_backend:
        return
    with LOAD_LOCK:
        if BACKEND_LOCAL_LOAD.get(target_backend, 0) > 0:
            BACKEND_LOCAL_LOAD[target_backend] -= 1


def get_comfy_history(comfy_address: str, prompt_id: str) -> dict:
    try:
        with urllib.request.urlopen(f"http://{comfy_address}/history/{prompt_id}") as response:
            return json.loads(response.read())
    except Exception:
        return {}


def comfy_output_extension(item: dict) -> str:
    filename = str((item or {}).get("filename") or "")
    ext = os.path.splitext(filename)[1].lower()
    allowed = {
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff",
        ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv",
        ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
        ".txt", ".json", ".csv", ".srt", ".vtt", ".md",
    }
    if ext in allowed:
        return ext
    fmt = str((item or {}).get("format") or "").lower()
    if "jpeg" in fmt or "jpg" in fmt:
        return ".jpg"
    if "png" in fmt or "image" in fmt:
        return ".png"
    return ".png"


def collect_comfy_file_items(node_output: dict) -> list[tuple[str, dict]]:
    items = []
    for key, value in (node_output or {}).items():
        if key in {"text", "texts", "prompt", "prompts", "string", "strings", "caption", "captions"}:
            continue
        candidates = value if isinstance(value, list) else [value]
        for item in candidates:
            if isinstance(item, dict) and item.get("filename"):
                items.append((key, item))
    return items


def workflow_graph_from_history(history_data: dict | None) -> dict[str, Any]:
    """Extract the prompt graph (node_id → node) from a ComfyUI history entry."""
    if not isinstance(history_data, dict):
        return {}
    prompt = history_data.get("prompt")
    if isinstance(prompt, list) and len(prompt) >= 3 and isinstance(prompt[2], dict):
        return prompt[2]
    if isinstance(prompt, dict):
        return prompt
    return {}


def comfy_image_item_priority(item: dict, class_type: str | None = None) -> int:
    """Lower sorts first: SaveImage / type=output before PreviewImage / type=temp.

    Control workflows (e.g. z-image-control) emit PreviewImage control maps that must
    not appear as the primary result thumbnail.
    """
    ct = str(class_type or "").strip()
    if ct == "SaveImage":
        return 0
    if ct == "PreviewImage":
        return 2
    file_type = str((item or {}).get("type") or "").strip().lower()
    if file_type == "output":
        return 0
    if file_type == "temp":
        return 2
    return 1


def iter_ordered_comfy_image_items(
    outputs: dict | None,
    workflow: dict | None = None,
) -> list[tuple[str, dict, str | None]]:
    """Yield (output_key, item, class_type) with final SaveImage outputs first."""
    collected: list[tuple[int, int, str, dict, str | None]] = []
    graph = workflow if isinstance(workflow, dict) else {}
    for order, (node_id, node_output) in enumerate((outputs or {}).items()):
        node = graph.get(str(node_id)) if graph else None
        class_type = None
        if isinstance(node, dict):
            class_type = node.get("class_type")
        for output_key, item in collect_comfy_file_items(node_output if isinstance(node_output, dict) else {}):
            priority = comfy_image_item_priority(item, class_type if isinstance(class_type, str) else None)
            collected.append((priority, order, output_key, item, class_type if isinstance(class_type, str) else None))
    collected.sort(key=lambda row: (row[0], row[1]))
    return [(output_key, item, class_type) for _prio, _ord, output_key, item, class_type in collected]


def download_comfy_output(comfy_address: str, item: dict, prefix: str = "studio_") -> str:
    ext = comfy_output_extension(item)
    filename = f"{prefix}{uuid.uuid4().hex[:10]}{ext}"
    local_path = output_path_for(filename, "output")
    subfolder = urllib.parse.quote(str(item.get("subfolder") or ""))
    file_type = urllib.parse.quote(str(item.get("type") or "output"))
    comfy_url_path = f"/view?filename={urllib.parse.quote(str(item['filename']))}&subfolder={subfolder}&type={file_type}"
    full_url = f"http://{comfy_address}{comfy_url_path}"
    try:
        with urllib.request.urlopen(full_url, timeout=COMFYUI_DOWNLOAD_TIMEOUT) as response, open(local_path, "wb") as out_file:
            shutil.copyfileobj(response, out_file)
        return output_url_for(filename, "output")
    except Exception:
        if comfy_url_path.startswith("/view"):
            return comfy_url_path.replace("/view", "/api/view", 1)
        return full_url


def humanize_comfy_error(message: str) -> str:
    """Turn opaque ComfyUI / HuggingFace errors into actionable hints."""
    lc = message.lower()
    hf_fail = (
        "hf-mirror" in lc
        or "localentrynotfound" in lc
        or ("couldn't connect" in lc and "load the files" in lc)
        or ("could not connect" in lc and "cached files" in lc)
        or ("308" in lc and "huggingface" in lc)
    )
    if not hf_fail:
        return message

    depth_hint = ""
    if "depth-anything" in lc or "depthanything" in lc or "depth_anything" in lc:
        depth_hint = (
            "Depth 权重请手动放到：\n"
            "{ComfyUI}/custom_nodes/comfyui_controlnet_aux/ckpts/depth-anything/"
            "Depth-Anything-V2-Large/depth_anything_v2_vitl.pth\n"
            "下载：https://huggingface.co/depth-anything/Depth-Anything-V2-Large\n"
        )

    return (
        "控制预处理器首次运行需从 HuggingFace 下载模型权重，但当前 HF 镜像/网络不可用 "
        "(常见：HF_ENDPOINT=https://hf-mirror.com 返回 308 或连不上)。"
        "此变量由 ComfyUI 运行环境设置，并非 Infinite Canvas 应用配置。\n"
        "可立即尝试：① 控制器改选「Canny 边缘」（内置 Canny，无需 HF）；"
        "② 取消或修正 ComfyUI 的 HF_ENDPOINT 后重启 ComfyUI；"
        "③ 手动下载权重放到 comfyui_controlnet_aux/ckpts/ 后再试。\n"
        f"{depth_hint}"
        f"原始错误：{message}"
    )


def apply_zimage_control_preprocessor(workflow: dict, params: dict[str, Any] | None) -> None:
    """Configure node 57: native Canny (offline) or AIO Aux Preprocessor (needs HF on first run)."""
    if "57" not in workflow:
        return

    node = workflow["57"]
    node_inputs = (params or {}).get("57") if isinstance(params, dict) else None
    preprocessor = None
    if isinstance(node_inputs, dict):
        preprocessor = node_inputs.get("preprocessor")

    use_native_canny = False
    if isinstance(node_inputs, dict) and "low_threshold" in node_inputs:
        use_native_canny = True
    elif preprocessor in ZIMAGE_NATIVE_CANNY_PREPROCESSORS or not preprocessor:
        use_native_canny = True

    if use_native_canny:
        low = 0.1
        high = 0.32
        if isinstance(node_inputs, dict):
            try:
                if node_inputs.get("low_threshold") is not None:
                    low = float(node_inputs["low_threshold"])
                if node_inputs.get("high_threshold") is not None:
                    high = float(node_inputs["high_threshold"])
            except (TypeError, ValueError):
                pass
        node["class_type"] = "Canny"
        node.setdefault("_meta", {})["title"] = "Canny边缘检测"
        node["inputs"] = {
            "low_threshold": low,
            "high_threshold": high,
            "image": ["58", 0],
        }
        return

    if not preprocessor or not isinstance(preprocessor, str):
        preprocessor = ZIMAGE_CONTROL_PREPROCESSORS["depth"]

    resolution = 512
    if isinstance(node_inputs, dict) and node_inputs.get("resolution") is not None:
        try:
            resolution = int(node_inputs["resolution"])
        except (TypeError, ValueError):
            resolution = 512

    node["class_type"] = "AIO_Preprocessor"
    node.setdefault("_meta", {})["title"] = "AIO Aux Preprocessor"
    node["inputs"] = {
        "preprocessor": preprocessor,
        "resolution": resolution,
        "image": ["58", 0],
    }


def enhance_size_scaled_denoise(width: int, height: int, strength: float) -> float:
    """Old Z-Image-Enhance strength formula (node 201): (width+height)*strength/10000.

    Feeds KSampler denoise (146/181), ImageAddNoise strength (184), and ImageBlend
    blend_factor (189). Example: 1024×1024 @ strength 0.5 → 0.1024.
    """
    return (int(width) + int(height)) * float(strength) / 10000.0


def apply_workflow_defaults(workflow: dict, req: GenerateRequest, seed: int) -> None:
    if "23" in workflow and req.prompt:
        workflow["23"]["inputs"]["text"] = req.prompt
    if "144" in workflow:
        workflow["144"]["inputs"]["width"] = req.width
        workflow["144"]["inputs"]["height"] = req.height
    if "22" in workflow:
        workflow["22"]["inputs"]["seed"] = seed
    if "158" in workflow:
        workflow["158"]["inputs"]["noise_seed"] = seed
    # custom/image_z_image_turbo.json (standard ComfyUI nodes)
    if "57:27" in workflow and req.prompt:
        workflow["57:27"]["inputs"]["text"] = req.prompt
    if "57:13" in workflow:
        workflow["57:13"]["inputs"]["width"] = req.width
        workflow["57:13"]["inputs"]["height"] = req.height
    if "57:3" in workflow and "inputs" in workflow["57:3"]:
        if "seed" in workflow["57:3"]["inputs"]:
            workflow["57:3"]["inputs"]["seed"] = seed
    # z-image-control.json (official ComfyUI controlnet workflow)
    if "70:45" in workflow and req.prompt:
        workflow["70:45"]["inputs"]["text"] = req.prompt
    if "70:44" in workflow and "inputs" in workflow["70:44"]:
        if "seed" in workflow["70:44"]["inputs"]:
            workflow["70:44"]["inputs"]["seed"] = seed
    if req.workflow_json == "z-image-control.json":
        apply_zimage_control_preprocessor(workflow, req.params)
        # Fixed resolution: params["70:41"] width/height replace GetImageSize links.
        # Follow-reference mode omits 70:41 so EmptySD3LatentImage keeps ["70:69", 0/1].
        latent_inputs = (req.params or {}).get("70:41") if isinstance(req.params, dict) else None
        if isinstance(latent_inputs, dict) and "70:41" in workflow:
            node_inputs = workflow["70:41"].setdefault("inputs", {})
            for key in ("width", "height"):
                if key in latent_inputs and not isinstance(latent_inputs[key], list):
                    try:
                        node_inputs[key] = int(latent_inputs[key])
                    except (TypeError, ValueError):
                        pass
    for node_id in ["146", "181"]:
        if node_id in workflow and "inputs" in workflow[node_id] and "seed" in workflow[node_id]["inputs"]:
            workflow[node_id]["inputs"]["seed"] = seed
    if "184" in workflow and "inputs" in workflow["184"] and "seed" in workflow["184"]["inputs"]:
        workflow["184"]["inputs"]["seed"] = seed
    if "172" in workflow and "inputs" in workflow["172"] and "seed" in workflow["172"]["inputs"]:
        workflow["172"]["inputs"]["seed"] = seed
    if "14" in workflow and "inputs" in workflow["14"] and "seed" in workflow["14"]["inputs"]:
        workflow["14"]["inputs"]["seed"] = seed
    # z-image-enhance.json — UI strength is node 204 (FloatConstant).
    # Dual-pass pipeline links denoise/noise/blend via MathExpression (201→202);
    # params merge sets 204.value and ComfyUI evaluates (w+h)*c/10000 at runtime.
    # Only override scalar denoise when formula graph is absent (legacy simplified wf).
    enhance_strength = (req.params or {}).get("204", {}).get("value")
    if enhance_strength is not None and req.workflow_json in {"z-image-enhance.json", "Z-Image-Enhance.json"}:
        try:
            denoise = float(enhance_strength)
        except (TypeError, ValueError):
            denoise = None
        if denoise is not None:
            for node_id in ("146", "181", "57:3", "70:44"):
                node = workflow.get(node_id)
                if isinstance(node, dict) and isinstance(node.get("inputs"), dict) and "denoise" in node["inputs"]:
                    if isinstance(node["inputs"]["denoise"], list):
                        continue
                    node["inputs"]["denoise"] = denoise


def sync_required_images(target_backend: str, required_images: list[str]) -> None:
    instances = comfyui_instances() or list(COMFYUI_INSTANCES)
    for image_name in required_images:
        need_sync = False
        try:
            check_url = f"http://{target_backend}/view?filename={urllib.parse.quote(image_name)}&type=input"
            resp = requests.get(check_url, stream=True, timeout=0.5)
            resp.close()
            if resp.status_code != 200:
                need_sync = True
        except Exception:
            need_sync = True
        if not need_sync:
            continue
        image_content = None
        image_type = "image/png"
        for addr in instances:
            if addr == target_backend:
                continue
            try:
                src_url = f"http://{addr}/view?filename={urllib.parse.quote(image_name)}&type=input"
                response = requests.get(src_url, timeout=5)
                if response.status_code == 200:
                    image_content = response.content
                    image_type = response.headers.get("Content-Type", "image/png")
                    break
            except Exception:
                continue
        if image_content:
            upload_image_to_comfyui(image_name, image_content, image_type)


def comfy_generate(req: GenerateRequest) -> dict[str, Any]:
    global NEXT_TASK_ID
    current_task = None
    target_backend = None
    with QUEUE_LOCK:
        task_id = NEXT_TASK_ID
        NEXT_TASK_ID += 1
        current_task = {"task_id": task_id, "client_id": req.client_id}
        QUEUE.append(current_task)

    try:
        required_images = collect_required_comfy_media(req.params)
        target_backend = reserve_best_backend(required_images)
        sync_required_images(target_backend, required_images)

        workflow_path = workflow_path_from_name(req.workflow_json)
        if not os.path.exists(workflow_path):
            raise Exception(f"Workflow file not found: {req.workflow_json}")

        with open(workflow_path, encoding="utf-8") as f:
            workflow = json.load(f)

        seed = random.randint(1, 4294967295)
        apply_workflow_defaults(workflow, req, seed)

        for node_id, node_inputs in (req.params or {}).items():
            if node_id in workflow:
                workflow[node_id].setdefault("inputs", {})
                if isinstance(node_inputs, dict):
                    for input_name, value in node_inputs.items():
                        workflow[node_id]["inputs"][input_name] = value

        payload = {"prompt": workflow, "client_id": CLIENT_ID}
        data = json.dumps(payload).encode("utf-8")
        try:
            post_req = urllib.request.Request(f"http://{target_backend}/prompt", data=data)
            prompt_id = json.loads(urllib.request.urlopen(post_req, timeout=10).read())["prompt_id"]
        except urllib.error.HTTPError as exc:
            error_body = (exc.read().decode("utf-8", errors="replace") or "").strip()
            if not error_body:
                error_body = f"(ComfyUI returned empty body for HTTP {exc.code})"
            raise Exception(f"HTTP Error {exc.code}: {error_body}") from exc

        history_data = None
        for _ in range(COMFYUI_HISTORY_TIMEOUT):
            res = get_comfy_history(target_backend, prompt_id)
            if prompt_id in res:
                history_data = res[prompt_id]
                break
            time.sleep(1)

        if not history_data:
            raise Exception("ComfyUI 渲染超时")

        local_images: list[str] = []
        local_urls: list[str] = []
        current_timestamp = time.time()
        prefix = f"{req.type}_{int(current_timestamp)}_"
        if "outputs" in history_data:
            workflow_graph = workflow_graph_from_history(history_data) or workflow
            for _output_key, item, _class_type in iter_ordered_comfy_image_items(
                history_data["outputs"],
                workflow_graph,
            ):
                local_path = download_comfy_output(target_backend, item, prefix=prefix)
                local_images.append(local_path)
                local_urls.append(local_path)

        result = {
            "prompt": req.prompt or "Detail Enhance",
            "images": local_images,
            "videos": [],
            "audios": [],
            "texts": [],
            "files": [],
            "items": [],
            "outputs": local_urls,
            "seed": seed,
            "timestamp": current_timestamp,
            "type": req.type,
            "workflow_json": req.workflow_json,
            "task_id": task_id,
            "prompt_id": prompt_id,
            "backend": target_backend,
            "params": req.params,
        }
        append_history_record(result)
        return result
    except Exception as exc:
        return {"images": [], "error": humanize_comfy_error(str(exc))}
    finally:
        release_backend_load(target_backend)
        if current_task:
            with QUEUE_LOCK:
                if current_task in QUEUE:
                    QUEUE.remove(current_task)
