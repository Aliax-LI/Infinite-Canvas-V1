"""Unit tests for legacy repo-root assets/output → DATA_DIR migration."""

from pathlib import Path

from backend.storage.legacy_media_migrate import (
    copy_missing_tree,
    migrate_legacy_media,
    migrate_legacy_media_once,
    reset_legacy_media_migrate_for_tests,
)


def _write(path: Path, content: str = "x") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_copy_missing_tree_copies_and_preserves_structure(tmp_path: Path) -> None:
    src = tmp_path / "assets"
    dest = tmp_path / "objects"
    _write(src / "input" / "a.png", "alpha")
    _write(src / "output" / "b.png", "beta")
    (src / "library" / "角色").mkdir(parents=True)

    copied, skipped, errors = copy_missing_tree(src, dest)

    assert errors == []
    assert copied == 2
    assert skipped == 0
    assert (dest / "input" / "a.png").read_text(encoding="utf-8") == "alpha"
    assert (dest / "output" / "b.png").read_text(encoding="utf-8") == "beta"
    assert (dest / "library" / "角色").is_dir()


def test_copy_missing_tree_is_idempotent_and_keeps_destination(tmp_path: Path) -> None:
    src = tmp_path / "assets"
    dest = tmp_path / "objects"
    _write(src / "input" / "a.png", "new")
    _write(dest / "input" / "a.png", "keep")
    _write(src / "input" / "b.png", "only-src")

    first = migrate_legacy_media(legacy_assets=src, assets_dir=dest)
    second = migrate_legacy_media(legacy_assets=src, assets_dir=dest)

    assert first.copied == 1
    assert first.skipped_existing == 1
    assert second.copied == 0
    assert second.skipped_existing == 2
    assert (dest / "input" / "a.png").read_text(encoding="utf-8") == "keep"
    assert (dest / "input" / "b.png").read_text(encoding="utf-8") == "only-src"


def test_migrate_skips_when_source_is_destination(tmp_path: Path) -> None:
    root = tmp_path / "objects"
    _write(root / "input" / "a.png", "same")
    report = migrate_legacy_media(legacy_assets=root, assets_dir=root)
    assert report.copied == 0
    assert report.trees == []


def test_migrate_also_copies_legacy_output(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    objects = tmp_path / "data" / "objects"
    legacy_out = tmp_path / "output"
    new_out = tmp_path / "data" / "output"
    _write(assets / "input" / "a.png", "img")
    _write(legacy_out / "export.png", "exp")

    report = migrate_legacy_media(
        legacy_assets=assets,
        assets_dir=objects,
        legacy_output=legacy_out,
        output_dir=new_out,
    )

    assert report.copied == 2
    assert (objects / "input" / "a.png").is_file()
    assert (new_out / "export.png").read_text(encoding="utf-8") == "exp"


def test_migrate_legacy_media_once_uses_config_and_gates(tmp_path, monkeypatch) -> None:
    reset_legacy_media_migrate_for_tests()
    legacy = tmp_path / "assets"
    objects = tmp_path / "data" / "objects"
    _write(legacy / "output" / "x.png", "blob")

    import backend.config as config

    monkeypatch.setattr(config, "LEGACY_ASSETS_DIR", legacy)
    monkeypatch.setattr(config, "ASSETS_DIR", objects)
    monkeypatch.setattr(config, "LEGACY_OUTPUT_DIR", None)
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path / "data" / "output")

    first = migrate_legacy_media_once()
    second = migrate_legacy_media_once()

    assert first is not None
    assert first.copied == 1
    assert second is None
    assert (objects / "output" / "x.png").read_text(encoding="utf-8") == "blob"
    reset_legacy_media_migrate_for_tests()
