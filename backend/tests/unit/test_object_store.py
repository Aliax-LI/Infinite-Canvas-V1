from backend.storage.object_store import ObjectStore, StoredObject


def test_stored_object_fields():
    obj = StoredObject(
        object_key="input/abc.png",
        content_type="image/png",
        size_bytes=1024,
        url="/assets/input/abc.png",
        sha256="deadbeef",
        original_filename="photo.png",
    )
    assert obj.object_key == "input/abc.png"
    assert obj.url.startswith("/assets/")


def test_object_store_interface_methods():
    required = {"put", "open", "exists", "delete", "copy", "resolve_url"}
    assert required.issubset(ObjectStore.__abstractmethods__)
