"""API contract baseline for /api/asset-library — freeze response shape before SQLite migration."""


def test_asset_library_get_shape(assets_client):
    response = assets_client.get("/api/asset-library")
    assert response.status_code == 200
    lib = response.json()["library"]
    assert "active_library_id" in lib
    assert "libraries" in lib
    assert isinstance(lib.get("categories"), list)


def test_local_assets_list_shape(assets_client):
    response = assets_client.get("/api/local-assets")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    assert "tree" in body
