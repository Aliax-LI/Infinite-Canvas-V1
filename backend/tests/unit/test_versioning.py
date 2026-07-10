from backend.services import versioning


def test_version_compare_handles_dotted_dates():
    assert versioning.version_gt("2026.07.10", "2026.07.6")
    assert not versioning.version_gt("2026.07.6", "2026.07.6")
