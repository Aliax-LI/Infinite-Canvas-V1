import json

from backend.services import workflow_availability as svc
from backend.services.workflow_availability import (
    check_workflow_availability_dict,
    extract_workflow_class_types,
    extract_workflow_model_refs,
    find_missing_models,
    find_missing_nodes,
)


SAMPLE_WORKFLOW = {
    "1": {
        "class_type": "UNETLoader",
        "inputs": {"unet_name": "z_image_turbo_bf16.safetensors"},
    },
    "2": {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "out", "images": ["1", 0]},
    },
    "3": {
        "class_type": "SeedVR2VideoUpscaler",
        "inputs": {},
    },
}


def test_extract_workflow_class_types_deduplicates():
    workflow = {
        **SAMPLE_WORKFLOW,
        "4": {"class_type": "SaveImage", "inputs": {}},
    }
    assert extract_workflow_class_types(workflow) == [
        "UNETLoader",
        "SaveImage",
        "SeedVR2VideoUpscaler",
    ]


def test_extract_workflow_model_refs():
    assert extract_workflow_model_refs(SAMPLE_WORKFLOW) == ["z_image_turbo_bf16.safetensors"]


def test_find_missing_nodes():
    object_info = {"UNETLoader": {}, "SaveImage": {}}
    missing = find_missing_nodes(extract_workflow_class_types(SAMPLE_WORKFLOW), object_info)
    assert missing == ["SeedVR2VideoUpscaler"]


def test_find_missing_models_when_options_known():
    object_info = {
        "UNETLoader": {
            "input": {
                "required": {
                    "unet_name": [["other_model.safetensors"], {"tooltip": ""}],
                }
            }
        }
    }
    missing = find_missing_models(SAMPLE_WORKFLOW, object_info)
    assert missing == ["z_image_turbo_bf16.safetensors"]


def test_check_workflow_availability_dict_all_present():
    object_info = {
        "UNETLoader": {
            "input": {
                "required": {
                    "unet_name": [["z_image_turbo_bf16.safetensors"], {}],
                }
            }
        },
        "SaveImage": {},
        "SeedVR2VideoUpscaler": {},
    }
    result = check_workflow_availability_dict(SAMPLE_WORKFLOW, object_info=object_info, comfy_online=True)
    assert result["available"] is True
    assert result["missing_nodes"] == []
    assert result["missing_models"] == []


def test_check_workflow_availability_dict_offline():
    result = check_workflow_availability_dict(SAMPLE_WORKFLOW, comfy_online=False)
    assert result["available"] is False
    assert "ComfyUI 未在线" in result["reason"]


def test_check_workflow_availability_service(monkeypatch, tmp_path):
    from backend.services import workflow_availability as svc

    workflow_dir = tmp_path / "workflows"
    workflow_dir.mkdir()
    workflow_file = workflow_dir / "demo.json"
    workflow_file.write_text(json.dumps(SAMPLE_WORKFLOW), encoding="utf-8")

    monkeypatch.setattr(svc, "load_workflow_dict", lambda name: SAMPLE_WORKFLOW if name == "demo.json" else (_ for _ in ()).throw(FileNotFoundError(name)))
    monkeypatch.setattr(
        "backend.services.comfyui_client._first_online_comfyui_address",
        lambda: "127.0.0.1:8188",
    )
    monkeypatch.setattr(
        "backend.services.comfyui_client._fetch_object_info",
        lambda _addr: {
            "UNETLoader": {},
            "SaveImage": {},
        },
    )

    svc.clear_workflow_availability_cache()
    result = svc.check_workflow_availability("demo.json", force_refresh=True)
    assert result["available"] is False
    assert "SeedVR2VideoUpscaler" in result["missing_nodes"]


def test_enhance_workflow_required_nodes_and_controlnet_model():
    """Dual-pass enhance must probe AIO / ControlNet / formula nodes + Union patch."""
    from pathlib import Path

    workflow_path = Path(__file__).resolve().parents[3] / "workflows" / "z-image-enhance.json"
    if not workflow_path.is_file():
        workflow_path = Path(__file__).resolve().parents[3] / "workflows" / "Z-Image-Enhance.json"
    workflow = json.loads(workflow_path.read_text(encoding="utf-8"))

    class_types = extract_workflow_class_types(workflow)
    for required in (
        "UNETLoader",
        "CLIPLoader",
        "AIO_Preprocessor",
        "ModelPatchLoader",
        "QwenImageDiffsynthControlnet",
        "MathExpression|pysssss",
        "easy convertAnything",
        "ImageAddNoise",
        "ImageSharpen",
        "ImageBlend",
        "FloatConstant",
    ):
        assert required in class_types, f"missing class_type {required}"

    # Inspire shared loaders must not reappear
    assert "LoadDiffusionModelShared //Inspire" not in class_types
    assert "LoadTextEncoderShared //Inspire" not in class_types

    models = extract_workflow_model_refs(workflow)
    assert "z_image_turbo_bf16.safetensors" in models
    assert "qwen_3_4b.safetensors" in models
    assert "ae.safetensors" in models
    assert "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" in models

    object_info = {name: {} for name in class_types}
    object_info["ModelPatchLoader"] = {
        "input": {
            "required": {
                "name": [["other_patch.safetensors"], {}],
            }
        }
    }
    object_info["UNETLoader"] = {
        "input": {
            "required": {
                "unet_name": [["z_image_turbo_bf16.safetensors"], {}],
            }
        }
    }
    object_info["CLIPLoader"] = {
        "input": {
            "required": {
                "clip_name": [["qwen_3_4b.safetensors"], {}],
            }
        }
    }
    object_info["VAELoader"] = {
        "input": {
            "required": {
                "vae_name": [["ae.safetensors"], {}],
            }
        }
    }
    missing_models = find_missing_models(workflow, object_info)
    assert "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" in missing_models

    result = check_workflow_availability_dict(workflow, object_info=object_info, comfy_online=True)
    assert result["available"] is False
    assert "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" in result["missing_models"]
