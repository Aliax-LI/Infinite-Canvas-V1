"""Classic (legacy) canvas editor persistence — create → add node → save → reload."""

CLASSIC_NODE = {
    "id": "img-1",
    "kind": "image",
    "x": 120,
    "y": 80,
    "width": 280,
    "height": 200,
    "title": "测试图片",
    "prompt": "",
    "images": [{"url": "/output/test_classic.png", "kind": "image", "name": "test.png"}],
    "settings": {},
}


def test_classic_canvas_create_add_node_save_reload(canvas_client):
    created = canvas_client.post(
        "/api/canvases",
        json={"title": "普通画布 Phase2", "kind": "classic"},
    )
    assert created.status_code == 200
    canvas_id = created.json()["canvas"]["id"]
    assert created.json()["canvas"]["kind"] == "classic"

    updated = canvas_client.put(
        f"/api/canvases/{canvas_id}",
        json={
            "title": "普通画布 Phase2",
            "nodes": [CLASSIC_NODE],
            "connections": [],
            "viewport": {"x": 10, "y": 20, "scale": 1.1},
            "settings": {},
        },
    )
    assert updated.status_code == 200
    body = updated.json()["canvas"]
    assert len(body["nodes"]) == 1
    assert body["nodes"][0]["id"] == "img-1"
    assert body["viewport"]["x"] == 10
    assert body["viewport"]["y"] == 20
    assert body["viewport"]["scale"] == 1.1

    reloaded = canvas_client.get(f"/api/canvases/{canvas_id}")
    assert reloaded.status_code == 200
    canvas = reloaded.json()["canvas"]
    assert canvas["kind"] == "classic"
    assert len(canvas["nodes"]) == 1
    assert canvas["nodes"][0]["images"][0]["url"] == "/output/test_classic.png"
    assert canvas["viewport"]["x"] == 10


def test_tool_result_append_to_classic_canvas(canvas_client):
    """Simulate tool generate → append image node → persist (Phase 3)."""
    created = canvas_client.post(
        "/api/canvases",
        json={"title": "工具导入目标", "kind": "classic"},
    )
    canvas_id = created.json()["canvas"]["id"]
    mock_output = "/output/enhance_mock_phase3.png"

    loaded = canvas_client.get(f"/api/canvases/{canvas_id}").json()["canvas"]
    assert loaded["nodes"] == []

    append_node = {
        "id": "tool-result-1",
        "kind": "image",
        "x": 260,
        "y": 100,
        "width": 280,
        "height": 200,
        "title": "增强结果",
        "prompt": "",
        "images": [{"url": mock_output, "kind": "image", "name": "增强结果"}],
        "settings": {},
    }
    saved = canvas_client.put(
        f"/api/canvases/{canvas_id}",
        json={
            "title": loaded["title"],
            "nodes": [append_node],
            "connections": [],
            "viewport": {"x": 0, "y": 0, "scale": 1},
            "settings": {},
        },
    )
    assert saved.status_code == 200

    reloaded = canvas_client.get(f"/api/canvases/{canvas_id}").json()["canvas"]
    assert len(reloaded["nodes"]) == 1
    assert reloaded["nodes"][0]["images"][0]["url"] == mock_output


def test_classic_canvas_history_type_field_roundtrip(canvas_client):
    """History saves `type` + top-level `url`; backend stores dict as-is; reload preserves fields."""
    created = canvas_client.post(
        "/api/canvases",
        json={"title": "History shape", "kind": "classic"},
    )
    canvas_id = created.json()["canvas"]["id"]
    history_node = {
        "id": "legacy-1",
        "type": "image",
        "x": 40,
        "y": 50,
        "url": "/assets/input/sample.png",
        "name": "sample.png",
        "mediaKind": "image",
    }
    canvas_client.put(
        f"/api/canvases/{canvas_id}",
        json={
            "title": "History shape",
            "nodes": [history_node],
            "connections": [],
            "viewport": {},
        },
    )
    reloaded = canvas_client.get(f"/api/canvases/{canvas_id}").json()["canvas"]
    node = reloaded["nodes"][0]
    assert node.get("type") == "image" or node.get("kind") == "image"
    assert node.get("url") == "/assets/input/sample.png" or (
        node.get("images") and node["images"][0].get("url") == "/assets/input/sample.png"
    )
