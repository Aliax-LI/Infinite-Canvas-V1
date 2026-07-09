def test_app_info_exposes_desktop_metadata(client):
    response = client.get("/api/app-info")

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"]
    assert payload["repo_url"].startswith("https://github.com/")
    assert payload["release_url"].endswith("/releases")
    assert "desktop_build_id" in payload


def test_check_update_uses_github_release_shape(client, monkeypatch):
    from backend import main

    monkeypatch.setattr(main, "current_app_version", lambda: "2026.07.6")
    monkeypatch.setattr(main, "current_desktop_build_id", lambda: "test-build")
    monkeypatch.setattr(
        main,
        "fetch_github_latest_release",
        lambda timeout=5.0: {
            "ok": True,
            "version": "2026.07.8",
            "release_url": "https://github.com/Aliax-LI/Infinite-Canvas-V1/releases/tag/v2026.07.8",
            "release_notes": "- test",
            "error": "",
        },
    )

    response = client.get("/api/check-update")

    assert response.status_code == 200
    payload = response.json()
    assert payload["current"] == "2026.07.6"
    assert payload["latest"]["version"] == "2026.07.8"
    assert payload["latest"]["release_url"].startswith("https://github.com/")
    assert payload["update_available"] is True
    assert payload["desktop_build_id"] == "test-build"


def test_removed_hot_update_endpoints_return_404(client):
    assert client.post("/api/update-from-github", json={}).status_code == 404
    assert client.get("/api/update-connectivity").status_code == 404
    assert client.get("/api/update-connectivity/probe", params={"name": "GitHub 版本文件"}).status_code == 404


def test_cors_rejects_non_localhost_origins(client):
    allowed = client.options(
        "/api/app-info",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    rejected = client.options(
        "/api/app-info",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert rejected.status_code == 400
