import pytest

from backend.storage.local_object_store import LocalObjectStore
from backend.storage.object_store import ObjectStoreError


@pytest.fixture
def store(tmp_path):
    return LocalObjectStore(tmp_path / "objects")


def test_put_bytes_and_open(store):
    obj = store.put(b"hello", content_type="text/plain", metadata={"original_filename": "a.txt"})
    assert obj.object_key.startswith("uploads/")
    assert obj.size_bytes == 5
    assert obj.sha256
    with store.open(obj.object_key) as f:
        assert f.read() == b"hello"


def test_put_does_not_overwrite_existing_key(store):
    key = "library/fixed.bin"
    store.put(b"v1", content_type="application/octet-stream", object_key=key)
    with pytest.raises(ObjectStoreError):
        store.put(b"v2", content_type="application/octet-stream", object_key=key)


def test_copy_and_delete(store):
    obj = store.put(b"data", content_type="text/plain")
    copied = store.copy(obj.object_key, "uploads/copy.txt")
    assert store.exists(copied.object_key)
    store.delete(obj.object_key)
    assert not store.exists(obj.object_key)


def test_resolve_url(store):
    obj = store.put(b"x", content_type="text/plain")
    assert store.resolve_url(obj.object_key) == obj.url


def test_rejects_path_traversal(store):
    with pytest.raises(ObjectStoreError):
        store.open("../secret")
