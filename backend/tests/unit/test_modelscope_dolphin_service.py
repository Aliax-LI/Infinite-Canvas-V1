from backend.services.modelscope_dolphin_service import (
    build_dolphin_models_payload,
    extract_dolphin_model_id,
    merge_modelscope_fetch_result,
    parse_mainstream_dolphin_models,
)


def test_build_dolphin_models_payload():
    payload = build_dolphin_models_payload(page_number=2, page_size=16)
    assert payload["PageNumber"] == 2
    assert payload["PageSize"] == 16
    assert payload["IsAigc"] is True
    assert payload["Criterion"][0]["category"] == "sub_vision_foundation"
    assert "Z_IMAGE_TURBO" in payload["Criterion"][0]["values"]
    assert "SD_XL" not in payload["Criterion"][0]["values"]


def test_extract_dolphin_model_id_prefers_backend_support():
    item = {
        "Path": "Tongyi-MAI",
        "Name": "Z-Image-Turbo",
        "BackendSupport": {"model_id": "Tongyi-MAI/Z-Image-Turbo"},
        "MuseInfo": {"model": {"modelName": "ignored"}},
    }
    assert extract_dolphin_model_id(item) == "Tongyi-MAI/Z-Image-Turbo"


def test_extract_dolphin_model_id_falls_back_to_path_name():
    item = {"Path": "Qwen", "Name": "Qwen-Image-2512"}
    assert extract_dolphin_model_id(item) == "Qwen/Qwen-Image-2512"


def test_parse_mainstream_dolphin_models():
    raw = {
        "Code": 200,
        "Data": {
            "Model": {
                "TotalCount": 2,
                "Models": [
                    {
                        "AigcAttributes": '{"SubVisionFoundation": "Z_IMAGE_TURBO"}',
                        "BackendSupport": {"model_id": "Tongyi-MAI/Z-Image-Turbo"},
                    },
                    {
                        "AigcAttributes": '{"SubVisionFoundation": "QWEN_IMAGE_2512"}',
                        "Path": "Qwen",
                        "Name": "Qwen-Image-2512",
                    },
                    {
                        "AigcAttributes": '{"SubVisionFoundation": "SD_XL"}',
                        "BackendSupport": {"model_id": "community/should-skip"},
                    },
                ],
            }
        },
    }
    ids = parse_mainstream_dolphin_models(raw)
    assert ids == ["Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image-2512"]


def test_resolve_sub_vision_foundation_from_target_model():
    from backend.services.modelscope_dolphin_service import resolve_sub_vision_foundation

    assert resolve_sub_vision_foundation(target_model="Tongyi-MAI/Z-Image-Turbo") == "Z_IMAGE_TURBO"
    assert resolve_sub_vision_foundation(sub_vision_foundation="QWEN_IMAGE_2512") == "QWEN_IMAGE_2512"
    assert resolve_sub_vision_foundation(target_model="unknown/model") == ""


def test_build_dolphin_loras_payload():
    from backend.services.modelscope_dolphin_service import build_dolphin_loras_payload

    payload = build_dolphin_loras_payload(sub_vision_foundation="Z_IMAGE_TURBO", page_number=1, page_size=16)
    assert payload["PageSize"] == 16
    assert payload["SingleCriterion"][0]["StringValue"] == "LoRA"
    assert payload["Criterion"][0]["values"] == ["Z_IMAGE_TURBO"]


def test_parse_dolphin_loras_response():
    from backend.services.modelscope_dolphin_service import parse_dolphin_loras_response

    raw = {
        "Code": 200,
        "Data": {
            "Model": {
                "TotalCount": 99,
                "Models": [
                    {
                        "AigcAttributes": '{"SubVisionFoundation": "Z_IMAGE_TURBO"}',
                        "Path": "Daniel8152",
                        "Name": "film",
                        "ChineseName": "胶片风格",
                    }
                ],
            }
        },
    }
    items, total = parse_dolphin_loras_response(raw)
    assert total == 99
    assert items == [{"id": "Daniel8152/film", "name": "胶片风格"}]


def test_merge_modelscope_fetch_result():
    merged = merge_modelscope_fetch_result(
        {
            "image_models": ["Qwen/Qwen-Image-Edit"],
            "chat_models": ["Qwen/Qwen3-235B-A22B"],
            "video_models": [],
            "all": ["Qwen/Qwen-Image-Edit", "Qwen/Qwen3-235B-A22B"],
            "message": "upstream",
        },
        ["Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image-2512"],
    )
    assert "Tongyi-MAI/Z-Image-Turbo" in merged["image_models"]
    assert "Qwen/Qwen-Image-2512" in merged["image_models"]
    assert "Qwen/Qwen-Image-Edit" in merged["image_models"]
    assert merged["chat_models"] == ["Qwen/Qwen3-235B-A22B"]
    assert merged["dolphin_image_count"] == 2
    assert merged["total"] == 4
