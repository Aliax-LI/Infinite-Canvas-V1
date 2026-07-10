from backend.services.api_providers_service import (
    default_api_providers,
    is_modelscope_context,
)
from backend.services.provider_probe_service import classify_upstream_model, parse_upstream_models


def test_is_modelscope_context():
    assert is_modelscope_context("modelscope")
    assert is_modelscope_context("", "https://api-inference.modelscope.cn/v1")
    assert not is_modelscope_context("openai", "https://api.openai.com/v1")


def test_classify_z_image_as_image():
    assert classify_upstream_model("Tongyi-MAI/Z-Image-Turbo") == "image"
    assert classify_upstream_model("Qwen/Qwen-Image-2512") == "image"
    assert classify_upstream_model("black-forest-labs/FLUX.2-klein-9B") == "image"


def test_classify_chat_models():
    assert classify_upstream_model("Qwen/Qwen3-235B-A22B") == "chat"


def test_parse_upstream_models_openai_format():
    grouped, ids = parse_upstream_models(
        {"data": [{"id": "Qwen/Qwen3-235B-A22B"}, {"id": "Tongyi-MAI/Z-Image-Turbo"}]},
        "openai",
    )
    assert "Qwen/Qwen3-235B-A22B" in ids
    assert "Tongyi-MAI/Z-Image-Turbo" in grouped["image"]


def test_default_modelscope_provider_has_no_preset_models():
    ms = next(p for p in default_api_providers() if p["id"] == "modelscope")
    assert ms["image_models"] == []
    assert ms["chat_models"] == []
    assert ms["ms_loras"] == []
