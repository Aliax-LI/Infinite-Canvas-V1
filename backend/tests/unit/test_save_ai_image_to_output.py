import base64
import os

import pytest

from backend.services.jimeng_cli_service import save_ai_image_to_output


@pytest.mark.asyncio
async def test_save_ai_image_b64_writes_file(tmp_path, monkeypatch):
    """Regression: b64 payloads must land in object store, not return empty string."""
    from backend.storage.local_object_store import LocalObjectStore
    from backend.storage import object_store_factory

    store = LocalObjectStore(tmp_path / "objects")
    monkeypatch.setattr(object_store_factory, "get_object_store", lambda: store)

    # 1x1 PNG
    png = base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    ).decode("ascii")

    url = await save_ai_image_to_output({"type": "b64", "value": png}, prefix="online_")
    assert url.startswith("/assets/output/")
    assert url.endswith(".png")
    key = url[len("/assets/") :]
    assert store.exists(key)
    path = store.filesystem_path(key)
    assert path.is_file()
    assert os.path.getsize(path) > 0


@pytest.mark.asyncio
async def test_save_ai_image_passthrough_local_url(tmp_path, monkeypatch):
    from backend.storage.local_object_store import LocalObjectStore
    from backend.storage import object_store_factory

    store = LocalObjectStore(tmp_path / "objects")
    monkeypatch.setattr(object_store_factory, "get_object_store", lambda: store)

    url = await save_ai_image_to_output(
        {"type": "url", "value": "/assets/output/existing.png"},
        prefix="online_",
    )
    assert url == "/assets/output/existing.png"
