from PIL import Image

from backend.services.ms_generate_service import modelscope_image_url


def test_modelscope_image_url_converts_local_asset_to_data_url(tmp_path, monkeypatch):
    from backend.config import OBJECTS_DIR

    png = OBJECTS_DIR / "input" / "ms_ref_test.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (4, 4), color=(0, 128, 255)).save(png)

    result = modelscope_image_url("/assets/input/ms_ref_test.png", max_size=1536)

    assert result.startswith("data:image/")
    assert ";base64," in result


def test_modelscope_image_url_converts_archive_output_path(tmp_path, monkeypatch):
    from backend.config import OBJECTS_DIR

    png = OBJECTS_DIR / "output" / "archive_ref.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (6, 6), color=(255, 0, 0)).save(png)

    result = modelscope_image_url("/assets/output/archive_ref.png")

    assert result.startswith("data:image/")
    assert ";base64," in result


def test_modelscope_image_url_passthrough_remote_url():
    url = "https://cdn.example.com/ref.png"
    assert modelscope_image_url(url) == url


def test_modelscope_image_url_passthrough_existing_data_url():
    data_url = "data:image/png;base64,abcd"
    assert modelscope_image_url(data_url) == data_url
