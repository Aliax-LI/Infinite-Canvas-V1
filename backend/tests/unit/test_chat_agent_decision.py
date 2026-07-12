"""Agent router: keyword heuristic + thinking-model text extraction."""

from backend.services import chat_service


def test_heuristic_detects_draw_without_hanzi_hua():
    """「绘制」does not contain「画」; must still route to generate_image."""
    decision = chat_service.heuristic_agent_decision("帮我绘制一个女孩", [], False)
    assert decision["action"] == "generate_image"


def test_parse_empty_llm_falls_back_to_draw_heuristic():
    decision = chat_service.parse_agent_decision("", "帮我绘制一个女孩", [], False)
    assert decision["action"] == "generate_image"


def test_parse_overrides_weak_chat_for_strong_draw_intent():
    raw = '{"action":"chat","prompt":"帮我绘制一个女孩","reply":""}'
    decision = chat_service.parse_agent_decision(raw, "帮我绘制一个女孩", [], False)
    assert decision["action"] == "generate_image"


def test_text_from_chat_response_uses_reasoning_when_content_empty():
    raw = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "",
                    "reasoning_content": '{"action":"generate_image","prompt":"一个女孩","reply":""}',
                }
            }
        ]
    }
    text = chat_service.text_from_chat_response(raw)
    assert "generate_image" in text
    decision = chat_service.parse_agent_decision(text, "帮我绘制一个女孩", [], False)
    assert decision["action"] == "generate_image"


def test_text_from_chat_response_strips_think_tags():
    raw = {
        "choices": [
            {
                "message": {
                    "content": '<think>plan</think>\n{"action":"generate_image","prompt":"猫","reply":""}',
                }
            }
        ]
    }
    text = chat_service.text_from_chat_response(raw)
    assert "<think>" not in text
    assert "generate_image" in text


def test_chat_agent_draw_with_empty_router_uses_heuristic(conversation_client, monkeypatch):
    async def fake_decide(payload, conversation, refs):
        # Simulate thinking model: empty content → heuristic inside decide would run;
        # here we call the real parse path via unit helpers above. Endpoint mock:
        return chat_service.parse_agent_decision("", payload.message, refs, False)

    async def fake_generate(prompt, size, quality, model, reference_images=None, provider_id="comfly"):
        return ({"type": "url", "value": "https://example.com/girl.png"}, {"usage": {}})

    async def fake_save(image_data, prefix="chat_"):
        return "/assets/output/girl.png"

    monkeypatch.setattr("backend.services.chat_service.decide_chat_agent_action", fake_decide)
    monkeypatch.setattr("backend.services.online_image_service.generate_ai_image", fake_generate)
    monkeypatch.setattr("backend.services.jimeng_cli_service.save_ai_image_to_output", fake_save)
    monkeypatch.setattr("backend.services.api_providers_service.provider_env_key_value", lambda provider_id: "test-key")

    response = conversation_client.post(
        "/api/chat/agent",
        json={
            "message": "帮我绘制一个女孩",
            "provider": "modelscope",
            "ms_model": "Qwen/Qwen3-8B",
            "image_provider": "modelscope",
            "image_model": "Z-Image-Turbo",
        },
        headers={"X-User-ID": "agent-draw-user"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["agent"]["action"] == "generate_image"
    assert payload["message"]["type"] == "image"
    assert "接口返回了空回复" not in (payload["message"].get("content") or "")
