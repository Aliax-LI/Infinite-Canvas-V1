from backend import main


def test_version_compare_handles_dotted_dates():
    assert main.version_gt("2026.07.10", "2026.07.9")
    assert not main.version_gt("2026.07.6", "2026.07.6")
