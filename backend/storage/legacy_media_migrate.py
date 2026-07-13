"""Idempotent migration of repo-root legacy media into DATA_DIR trees.

Copies missing files from:
  - LEGACY_ASSETS_DIR (repo `assets/`) → ASSETS_DIR / OBJECTS_DIR (`DATA_DIR/objects/`)
  - LEGACY_OUTPUT_DIR (repo `output/`) → OUTPUT_DIR (`DATA_DIR/output/`)

Existing destination files always win. Sources are left in place as read-only fallback.
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass, field
from pathlib import Path

_logger = logging.getLogger("infinite_canvas.storage")
_MIGRATED_ONCE = False


@dataclass
class LegacyMediaMigrateReport:
    copied: int = 0
    skipped_existing: int = 0
    errors: list[str] = field(default_factory=list)
    trees: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def copy_missing_tree(source: Path, destination: Path) -> tuple[int, int, list[str]]:
    """Recursively copy files/dirs from source into destination.

    Returns ``(copied, skipped_existing, errors)``. Destination files are never overwritten.
    """
    copied = 0
    skipped = 0
    errors: list[str] = []

    try:
        source = source.expanduser().resolve()
        destination = destination.expanduser().resolve()
    except OSError as exc:
        return 0, 0, [f"resolve failed: {source} → {destination}: {exc}"]

    if not source.exists():
        return 0, 0, []
    if source == destination:
        return 0, 0, []

    try:
        if source.is_file():
            if destination.exists():
                return 0, 1, []
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            return 1, 0, []
    except OSError as exc:
        return 0, 0, [f"copy file failed: {source} → {destination}: {exc}"]

    if not source.is_dir():
        return 0, 0, [f"unsupported source type: {source}"]

    try:
        destination.mkdir(parents=True, exist_ok=True)
        entries = sorted(source.iterdir(), key=lambda p: p.name)
    except OSError as exc:
        return 0, 0, [f"list failed: {source}: {exc}"]

    for entry in entries:
        child_dest = destination / entry.name
        try:
            # Refuse to copy a tree into itself (e.g. data under assets by mistake).
            if entry.is_dir() and child_dest.resolve() == entry.resolve():
                continue
            if entry.is_symlink():
                # Skip symlinks to avoid escaping the storage root.
                skipped += 1
                continue
            c, s, errs = copy_missing_tree(entry, child_dest)
            copied += c
            skipped += s
            errors.extend(errs)
        except OSError as exc:
            errors.append(f"entry failed: {entry}: {exc}")

    return copied, skipped, errors


def migrate_legacy_media(
    *,
    legacy_assets: Path | None,
    assets_dir: Path,
    legacy_output: Path | None = None,
    output_dir: Path | None = None,
) -> LegacyMediaMigrateReport:
    """Copy missing legacy media into the unified writable roots."""
    report = LegacyMediaMigrateReport()

    pairs: list[tuple[str, Path | None, Path | None]] = [
        ("assets→objects", legacy_assets, assets_dir),
        ("output→data/output", legacy_output, output_dir),
    ]
    for label, src, dest in pairs:
        if src is None or dest is None:
            continue
        try:
            src_resolved = src.expanduser().resolve()
            dest_resolved = dest.expanduser().resolve()
        except OSError as exc:
            report.errors.append(f"{label}: resolve failed: {exc}")
            continue
        if not src_resolved.exists() or src_resolved == dest_resolved:
            continue
        report.trees.append(f"{src_resolved} → {dest_resolved}")
        copied, skipped, errors = copy_missing_tree(src_resolved, dest_resolved)
        report.copied += copied
        report.skipped_existing += skipped
        report.errors.extend(errors)

    if report.copied or report.errors:
        _logger.info(
            "legacy media migrate copied=%s skipped_existing=%s errors=%s trees=%s",
            report.copied,
            report.skipped_existing,
            len(report.errors),
            report.trees,
        )
    return report


def migrate_legacy_media_once() -> LegacyMediaMigrateReport | None:
    """Run migration at most once per process using current config paths."""
    global _MIGRATED_ONCE
    if _MIGRATED_ONCE:
        return None
    _MIGRATED_ONCE = True
    from backend.config import ASSETS_DIR, LEGACY_ASSETS_DIR, LEGACY_OUTPUT_DIR, OUTPUT_DIR

    return migrate_legacy_media(
        legacy_assets=LEGACY_ASSETS_DIR,
        assets_dir=ASSETS_DIR,
        legacy_output=LEGACY_OUTPUT_DIR,
        output_dir=OUTPUT_DIR,
    )


def reset_legacy_media_migrate_for_tests() -> None:
    """Test helper to allow re-running the once-per-process gate."""
    global _MIGRATED_ONCE
    _MIGRATED_ONCE = False
