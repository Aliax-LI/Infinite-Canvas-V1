from pathlib import Path

import pytest

from backend.services.workflow_export import (
    api_prompt_to_ui_workflow,
    build_workflow_export_payload,
    extract_export_node_types,
    is_comfy_api_prompt,
    is_comfy_ui_workflow,
)

WORKFLOWS_DIR = Path(__file__).resolve().parents[3] / "workflows"

TOOL_EXPECTED_TYPES = {
    "z-image-enhance.json": {
        "AIO_Preprocessor",
        "QwenImageDiffsynthControlnet",
        "ModelPatchLoader",
        "MathExpression|pysssss",
        "easy convertAnything",
        "FloatConstant",
    },
    "upscale.json": {
        "SeedVR2LoadDiTModel",
        "SeedVR2LoadVAEModel",
        "SeedVR2VideoUpscaler",
    },
    "Flux2-Klein.json": {
        "LoadDiffusionModelShared //Inspire",
        "LoadTextEncoderShared //Inspire",
        "ComfySwitchNode",
        "ReferenceLatent",
    },
    "z-image-control.json": {
        "QwenImageDiffsynthControlnet",
        "ModelPatchLoader",
        "Canny",
        "LoadImage",
    },
}


SAMPLE_API = {
    "15": {
        "class_type": "LoadImage",
        "inputs": {"image": "a.png"},
        "_meta": {"title": "加载图像"},
    },
    "169": {
        "class_type": "SeedVR2LoadDiTModel",
        "inputs": {"model": "seedvr2.safetensors"},
    },
    "172": {
        "class_type": "SeedVR2VideoUpscaler",
        "inputs": {
            "image": ["15", 0],
            "dit": ["169", 0],
            "seed": 1,
        },
    },
}


def test_api_prompt_to_ui_preserves_class_types_as_node_types():
    ui = api_prompt_to_ui_workflow(SAMPLE_API)
    assert is_comfy_ui_workflow(ui)
    assert not is_comfy_api_prompt(ui)
    types = extract_export_node_types(ui)
    assert types == [
        "LoadImage",
        "SeedVR2LoadDiTModel",
        "SeedVR2VideoUpscaler",
    ]
    assert ui["extra"]["api_prompt"]["172"]["class_type"] == "SeedVR2VideoUpscaler"
    assert len(ui["links"]) == 2


def test_ui_passthrough():
    ui = {
        "nodes": [{"id": 1, "type": "SaveImage", "inputs": [], "outputs": []}],
        "links": [],
    }
    assert api_prompt_to_ui_workflow(ui) is ui


@pytest.mark.parametrize("filename,expected", sorted(TOOL_EXPECTED_TYPES.items()))
def test_build_export_payload_contains_tool_custom_nodes(filename, expected):
    path = WORKFLOWS_DIR / filename
    if not path.is_file() and filename == "z-image-enhance.json":
        path = WORKFLOWS_DIR / "Z-Image-Enhance.json"
    if not path.is_file():
        pytest.skip(f"{filename} not present")

    # Ensure export path resolves against real WORKFLOW_DIR
    payload, out_name = build_workflow_export_payload(filename if (WORKFLOWS_DIR / filename).is_file() else path.name)
    assert out_name.endswith(".json")
    assert is_comfy_ui_workflow(payload)
    types = set(extract_export_node_types(payload))
    missing = expected - types
    assert not missing, f"{filename} export missing types: {missing}"


def test_subgraph_style_ids_convert():
    api = {
        "70:39": {"class_type": "UNETLoader", "inputs": {"unet_name": "x.safetensors"}},
        "9": {
            "class_type": "SaveImage",
            "inputs": {"images": ["70:39", 0], "filename_prefix": "out"},
        },
    }
    ui = api_prompt_to_ui_workflow(api)
    types = extract_export_node_types(ui)
    assert types == ["UNETLoader", "SaveImage"]
    assert len(ui["links"]) == 1
