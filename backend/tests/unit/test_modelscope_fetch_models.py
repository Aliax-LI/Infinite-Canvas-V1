import asyncio

from backend.services.api_providers_service import (
    default_api_providers,
    is_modelscope_context,
)
from backend.services.modelscope_dolphin_service import (
    enrich_modelscope_fetch_result,
    filter_supported_modelscope_chat_models,
    is_modelscope_unsupported_chat_error,
    merge_modelscope_fetch_result,
)
from backend.services.provider_probe_service import classify_upstream_model, parse_upstream_models


def test_is_modelscope_unsupported_chat_error():
    assert is_modelscope_unsupported_chat_error('{"error":{"message":"Model id : Qwen/Qwen3-4B , has no provider supported"}}')
    assert not is_modelscope_unsupported_chat_error('{"error":{"message":"rate limit exceeded"}}')


def test_merge_modelscope_fetch_result_reports_filtered_chat_models():
    merged = merge_modelscope_fetch_result(
        {
            "image_models": [],
            "chat_models": ["Qwen/Qwen3-8B"],
            "video_models": [],
            "all": ["Qwen/Qwen3-8B"],
            "message": "upstream",
        },
        [],
        filtered_chat_models=["Qwen/Qwen3-4B"],
    )
    assert merged["chat_models"] == ["Qwen/Qwen3-8B"]
    assert merged["filtered_chat_models"] == ["Qwen/Qwen3-4B"]
    assert "已过滤 1 个不可调用对话模型" in merged["message"]


def test_filter_supported_modelscope_chat_models(monkeypatch):
    class MockResponse:
        def __init__(self, status_code: int, text: str):
            self.status_code = status_code
            self.text = text

    async def mock_probe(client, url, headers, model):
        if model == "Qwen/Qwen3-4B":
            return model, False
        if model == "Qwen/Qwen3-8B":
            return model, True
        return model, True

    monkeypatch.setattr(
        "backend.services.modelscope_dolphin_service._probe_one_modelscope_chat_model",
        mock_probe,
    )

    supported, filtered = asyncio.run(
        filter_supported_modelscope_chat_models(
            ["Qwen/Qwen3-4B", "Qwen/Qwen3-8B", "Qwen/Qwen2.5-7B-Instruct"],
            "https://api-inference.modelscope.cn/v1",
            "test-key",
        )
    )
    assert supported == ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen3-8B"]
    assert filtered == ["Qwen/Qwen3-4B"]


def test_enrich_modelscope_fetch_result_filters_chat_models(monkeypatch):
    async def mock_filter(chat_models, base_url, api_key):
        return ["Qwen/Qwen3-8B"], ["Qwen/Qwen3-4B"]

    async def mock_dolphin():
        return ["Tongyi-MAI/Z-Image-Turbo"]

    monkeypatch.setattr(
        "backend.services.modelscope_dolphin_service.filter_supported_modelscope_chat_models",
        mock_filter,
    )
    monkeypatch.setattr(
        "backend.services.modelscope_dolphin_service.fetch_dolphin_image_model_ids",
        mock_dolphin,
    )

    result = asyncio.run(
        enrich_modelscope_fetch_result(
            {
                "image_models": [],
                "chat_models": ["Qwen/Qwen3-4B", "Qwen/Qwen3-8B"],
                "video_models": [],
                "all": ["Qwen/Qwen3-4B", "Qwen/Qwen3-8B"],
                "message": "upstream",
            },
            base_url="https://api-inference.modelscope.cn/v1",
            api_key="test-key",
        )
    )
    assert result["chat_models"] == ["Qwen/Qwen3-8B"]
    assert "Qwen/Qwen3-4B" not in result["all"]
    assert "Tongyi-MAI/Z-Image-Turbo" in result["image_models"]
    assert "已过滤 1 个不可调用对话模型" in result["message"]


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
