from backend.models.generate import GenerateRequest
from backend.services.comfy_generate_service import (
    ZIMAGE_CONTROL_PREPROCESSORS,
    apply_workflow_defaults,
    apply_zimage_control_preprocessor,
    comfy_image_item_priority,
    enhance_size_scaled_denoise,
    humanize_comfy_error,
    iter_ordered_comfy_image_items,
    workflow_graph_from_history,
)


def test_apply_workflow_defaults_official_t2i_nodes():
    workflow = {
        "57:27": {"inputs": {"text": ""}},
        "57:13": {"inputs": {"width": 512, "height": 512}},
        "57:3": {"inputs": {"seed": 1}},
    }
    req = GenerateRequest(prompt="hello", width=1024, height=768)
    apply_workflow_defaults(workflow, req, seed=42)

    assert workflow["57:27"]["inputs"]["text"] == "hello"
    assert workflow["57:13"]["inputs"]["width"] == 1024
    assert workflow["57:13"]["inputs"]["height"] == 768
    assert workflow["57:3"]["inputs"]["seed"] == 42


def test_apply_workflow_defaults_official_control_nodes():
    workflow = {
        "70:45": {"inputs": {"text": ""}},
        "70:44": {"inputs": {"seed": 1}},
        "70:41": {
            "inputs": {
                "width": ["70:69", 0],
                "height": ["70:69", 1],
                "batch_size": 1,
            }
        },
        "58": {"inputs": {"image": "ref.png"}},
        "57": {
            "class_type": "Canny",
            "inputs": {"low_threshold": 0.1, "high_threshold": 0.32, "image": ["58", 0]},
        },
    }
    req = GenerateRequest(
        prompt="portrait",
        width=1024,
        height=1024,
        workflow_json="z-image-control.json",
        params={"57": {"preprocessor": "OpenposePreprocessor", "resolution": 768}},
    )
    apply_workflow_defaults(workflow, req, seed=99)

    assert workflow["70:45"]["inputs"]["text"] == "portrait"
    assert workflow["70:44"]["inputs"]["seed"] == 99
    assert workflow["57"]["class_type"] == "AIO_Preprocessor"
    assert workflow["57"]["inputs"]["preprocessor"] == "OpenposePreprocessor"
    assert workflow["57"]["inputs"]["resolution"] == 768
    # follow-reference: GetImageSize links preserved
    assert workflow["70:41"]["inputs"]["width"] == ["70:69", 0]
    assert workflow["70:41"]["inputs"]["height"] == ["70:69", 1]


def test_apply_workflow_defaults_control_fixed_resolution():
    workflow = {
        "70:45": {"inputs": {"text": ""}},
        "70:44": {"inputs": {"seed": 1}},
        "70:41": {
            "inputs": {
                "width": ["70:69", 0],
                "height": ["70:69", 1],
                "batch_size": 1,
            }
        },
        "57": {
            "class_type": "Canny",
            "inputs": {"low_threshold": 0.1, "high_threshold": 0.32, "image": ["58", 0]},
        },
    }
    req = GenerateRequest(
        prompt="portrait",
        workflow_json="z-image-control.json",
        params={
            "57": {"low_threshold": 0.1, "high_threshold": 0.32},
            "70:41": {"width": 768, "height": 1024},
        },
    )
    apply_workflow_defaults(workflow, req, seed=11)

    assert workflow["70:41"]["inputs"]["width"] == 768
    assert workflow["70:41"]["inputs"]["height"] == 1024
    assert workflow["70:41"]["inputs"]["batch_size"] == 1


def test_apply_zimage_control_preprocessor_native_canny():
    workflow = {
        "57": {
            "class_type": "AIO_Preprocessor",
            "inputs": {"preprocessor": "CannyEdgePreprocessor", "resolution": 512, "image": ["58", 0]},
        },
    }
    apply_zimage_control_preprocessor(workflow, {"57": {"low_threshold": 0.2, "high_threshold": 0.4}})

    assert workflow["57"]["class_type"] == "Canny"
    assert workflow["57"]["inputs"]["low_threshold"] == 0.2
    assert workflow["57"]["inputs"]["high_threshold"] == 0.4
    assert "preprocessor" not in workflow["57"]["inputs"]


def test_apply_zimage_control_preprocessor_aio_depth():
    workflow = {
        "57": {
            "class_type": "Canny",
            "inputs": {"low_threshold": 0.1, "high_threshold": 0.32, "image": ["58", 0]},
        },
    }
    apply_zimage_control_preprocessor(
        workflow,
        {"57": {"preprocessor": "DepthAnythingV2Preprocessor", "resolution": 512}},
    )

    assert workflow["57"]["class_type"] == "AIO_Preprocessor"
    assert workflow["57"]["inputs"]["preprocessor"] == "DepthAnythingV2Preprocessor"


def test_zimage_control_preprocessors_match_aio_combo_keys():
    """Must match comfyui_controlnet_aux NODE_CLASS_MAPPINGS / AIO dropdown exactly."""
    assert ZIMAGE_CONTROL_PREPROCESSORS == {
        "canny": "CannyEdgePreprocessor",
        "depth": "DepthAnythingV2Preprocessor",
        "pose": "OpenposePreprocessor",
        "hed": "HEDPreprocessor",
        "mlsd": "M-LSDPreprocessor",
    }


def test_apply_zimage_control_preprocessor_aio_mlsd():
    workflow = {
        "57": {
            "class_type": "Canny",
            "inputs": {"low_threshold": 0.1, "high_threshold": 0.32, "image": ["58", 0]},
        },
    }
    apply_zimage_control_preprocessor(
        workflow,
        {"57": {"preprocessor": "M-LSDPreprocessor", "resolution": 512}},
    )

    assert workflow["57"]["class_type"] == "AIO_Preprocessor"
    assert workflow["57"]["inputs"]["preprocessor"] == "M-LSDPreprocessor"


def test_humanize_comfy_error_hf_mirror():
    raw = "We couldn't connect to 'https://hf-mirror.com' to load the files, and couldn't find them in the cached files."
    msg = humanize_comfy_error(raw)
    assert "Canny" in msg
    assert "HF_ENDPOINT" in msg
    assert raw in msg


def test_humanize_comfy_error_depth_local_entry():
    raw = (
        "LocalEntryNotFoundError: depth-anything/Depth-Anything-V2-Large/"
        "depth_anything_v2_vitl.pth via https://hf-mirror.com (308)"
    )
    msg = humanize_comfy_error(raw)
    assert "depth_anything_v2_vitl.pth" in msg
    assert "Depth-Anything-V2-Large" in msg
    assert "Canny" in msg


def test_enhance_size_scaled_denoise_matches_old_formula():
    # Old node 201: (a+b)*c/10000 — 1024×1024 @ 0.5 → 0.1024
    assert enhance_size_scaled_denoise(1024, 1024, 0.5) == 0.1024
    assert enhance_size_scaled_denoise(512, 512, 0.5) == 0.0512
    assert enhance_size_scaled_denoise(2048, 1024, 1.0) == 0.3072


def test_apply_workflow_defaults_enhance_preserves_linked_denoise():
    """Dual-pass formula graph: denoise is a link to node 202 — do not overwrite."""
    linked = ["202", 0]
    workflow = {
        "146": {"inputs": {"denoise": linked, "seed": 1}},
        "181": {"inputs": {"denoise": linked, "seed": 1}},
        "204": {"inputs": {"value": 0.5}},
    }
    req = GenerateRequest(
        workflow_json="z-image-enhance.json",
        params={"204": {"value": 0.72}},
        type="enhance",
    )
    apply_workflow_defaults(workflow, req, seed=7)

    assert workflow["146"]["inputs"]["denoise"] == linked
    assert workflow["181"]["inputs"]["denoise"] == linked
    assert workflow["146"]["inputs"]["seed"] == 7


def test_apply_workflow_defaults_enhance_strength_maps_to_scalar_denoise():
    """Legacy simplified workflow without formula nodes still maps 204 → denoise."""
    workflow = {
        "146": {"inputs": {"denoise": 0.5, "seed": 1}},
        "181": {"inputs": {"denoise": 0.5, "seed": 1}},
    }
    req = GenerateRequest(
        workflow_json="z-image-enhance.json",
        params={"204": {"value": 0.72}},
        type="enhance",
    )
    apply_workflow_defaults(workflow, req, seed=7)

    assert workflow["146"]["inputs"]["denoise"] == 0.72
    assert workflow["181"]["inputs"]["denoise"] == 0.72
    assert workflow["146"]["inputs"]["seed"] == 7


def test_comfy_image_item_priority_save_before_preview():
    assert comfy_image_item_priority({"type": "temp"}, "SaveImage") == 0
    assert comfy_image_item_priority({"type": "output"}, "PreviewImage") == 2
    assert comfy_image_item_priority({"type": "output"}, None) == 0
    assert comfy_image_item_priority({"type": "temp"}, None) == 2


def test_iter_ordered_comfy_image_items_control_preview_last():
    """z-image-control: PreviewImage (56) often appears before SaveImage (9) in outputs."""
    outputs = {
        "56": {
            "images": [{"filename": "canny_preview.png", "subfolder": "", "type": "temp"}],
        },
        "9": {
            "images": [
                {"filename": "final_a.png", "subfolder": "", "type": "output"},
                {"filename": "final_b.png", "subfolder": "", "type": "output"},
            ],
        },
    }
    workflow = {
        "9": {"class_type": "SaveImage", "inputs": {}},
        "56": {"class_type": "PreviewImage", "inputs": {}},
    }
    ordered = iter_ordered_comfy_image_items(outputs, workflow)
    filenames = [item["filename"] for _key, item, _ct in ordered]
    assert filenames == ["final_a.png", "final_b.png", "canny_preview.png"]


def test_iter_ordered_comfy_image_items_t2i_unchanged_without_preview():
    outputs = {
        "9": {
            "images": [{"filename": "only.png", "subfolder": "", "type": "output"}],
        },
    }
    workflow = {"9": {"class_type": "SaveImage", "inputs": {}}}
    ordered = iter_ordered_comfy_image_items(outputs, workflow)
    assert len(ordered) == 1
    assert ordered[0][1]["filename"] == "only.png"


def test_iter_ordered_comfy_image_items_falls_back_to_file_type():
    outputs = {
        "56": {"images": [{"filename": "edge.png", "type": "temp"}]},
        "9": {"images": [{"filename": "gen.png", "type": "output"}]},
    }
    ordered = iter_ordered_comfy_image_items(outputs, workflow=None)
    assert [item["filename"] for _k, item, _c in ordered] == ["gen.png", "edge.png"]


def test_workflow_graph_from_history_prompt_list():
    history = {
        "prompt": [1, "pid", {"9": {"class_type": "SaveImage"}, "56": {"class_type": "PreviewImage"}}],
        "outputs": {},
    }
    graph = workflow_graph_from_history(history)
    assert graph["9"]["class_type"] == "SaveImage"
    assert graph["56"]["class_type"] == "PreviewImage"
