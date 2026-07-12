from backend.services.asset_library_service import normalize_item_tags, set_item_tags


def test_normalize_item_tags_dedupes_and_splits():
    assert normalize_item_tags(["室内", "室内", "产品"]) == ["室内", "产品"]
    assert normalize_item_tags("室内, 产品、电商") == ["室内", "产品", "电商"]


def test_set_item_tags_syncs_classification():
    item = {"classification": {"tags": ["旧"], "summary": "x"}}
    set_item_tags(item, ["新标签"])
    assert item["tags"] == ["新标签"]
    assert item["classification"]["tags"] == ["新标签"]
