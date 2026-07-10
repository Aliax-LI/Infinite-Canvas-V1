def test_codex_status(client):
    response = client.get("/api/codex/status")
    assert response.status_code == 200
    payload = response.json()
    assert "installed" in payload
    assert "message" in payload


def test_gemini_cli_status(client):
    response = client.get("/api/gemini-cli/status")
    assert response.status_code == 200
    payload = response.json()
    assert "installed" in payload


def test_jimeng_status(client):
    response = client.get("/api/jimeng/status")
    assert response.status_code == 200
    payload = response.json()
    assert "installed" in payload


def test_cli_status_force_installed_in_electron_test_mode(client, monkeypatch):
    monkeypatch.setenv("INFINITE_CANVAS_TEST", "1")
    monkeypatch.setenv("INFINITE_CANVAS_TEST_CLI_INSTALLED", "1")

    codex = client.get("/api/codex/status").json()
    gemini = client.get("/api/gemini-cli/status").json()
    jimeng = client.get("/api/jimeng/status").json()

    assert codex["installed"] is True
    assert gemini["installed"] is True
    assert jimeng["installed"] is True
    assert jimeng["logged_in"] is False


def test_jimeng_credit_requires_cli(client):
    response = client.get("/api/jimeng/credit")
    assert response.status_code in {400, 502}


def test_jimeng_help_requires_cli(client):
    response = client.post("/api/jimeng/help", json={"command": "login"})
    assert response.status_code in {400, 502}


def test_jimeng_credit_mock(client, monkeypatch):
    async def fake_run(args, timeout=120, raw_text=False):
        return {"total_credit": 100}

    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_cli_executable", lambda: "/usr/bin/dreamina")
    monkeypatch.setattr("backend.services.jimeng_cli_service.run_jimeng_cli", fake_run)
    response = client.get("/api/jimeng/credit")
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_jimeng_query_media_missing_submit_id(client):
    response = client.post("/api/jimeng/query-media", json={"submit_id": "", "kind": "image"})
    assert response.status_code == 400


def test_jimeng_query_media_succeeded(client, monkeypatch):
    async def fake_query_result(submit_id, kind="image"):
        return {"images": ["https://example.com/out.png"]}

    async def fake_store_outputs(raw, kind="image", allow_query=True):
        return ["/assets/output/jimeng_test.png"]

    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_query_result", fake_query_result)
    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_store_outputs", fake_store_outputs)
    response = client.post("/api/jimeng/query-media", json={"submit_id": "task-123", "kind": "image"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "succeeded"
    assert payload["submit_id"] == "task-123"
    assert payload["urls"] == ["/assets/output/jimeng_test.png"]


def test_jimeng_query_media_pending(client, monkeypatch):
    from backend.services.jimeng_cli_service import JimengPendingError

    async def fake_query_result(submit_id, kind="image"):
        return {"submit_id": submit_id, "queue_info": {"queue_idx": 2, "queue_length": 5}}

    async def fake_store_outputs(raw, kind="image", allow_query=True):
        raise JimengPendingError("task-456", kind, {"queue_idx": 2, "queue_length": 5}, raw)

    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_query_result", fake_query_result)
    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_store_outputs", fake_store_outputs)
    response = client.post("/api/jimeng/query-media", json={"submit_id": "task-456", "kind": "video"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["queue_info"]["queue_idx"] == 2
    assert "task-456" in payload["message"]


def test_jimeng_login_flow_mock(client, monkeypatch):
    async def fake_login_start():
        return {"success": True, "running": True, "text": "scan qr", "qr_url": "https://example.com/qr", "started_at": 1}

    async def fake_login_status():
        return {"success": True, "running": False, "logged_in": True, "text": "ok", "qr_url": "", "raw": {}}

    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_login_start", fake_login_start)
    monkeypatch.setattr("backend.services.jimeng_cli_service.jimeng_login_status", fake_login_status)
    start = client.post("/api/jimeng/login/start")
    assert start.status_code == 200
    assert start.json().get("running") is True
    status = client.get("/api/jimeng/login/status")
    assert status.status_code == 200
    assert status.json().get("logged_in") is True
