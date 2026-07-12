"""Backup and clean junk from data/ directory."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ARCHIVE = DATA / "_pre_cleanup_archive_20260712"
MANIFEST = ARCHIVE / "manifest.json"

TEST_CONV_USERS = {
    "diag-user-1",
    "flow-test-user",
    "model-test",
    "test-debug",
    "test-debug2",
}

REMOVE_OBJECT_KEYS = [
    "input/ai_ref_70aae328bbca.png",
    "input/ai_ref_b51cd7ee3875.png",
    "input/ai_ref_f5841ddbb4f3.png",
    "input/ms_ref_test.png",
    "input/test.txt",
    "output/archive_ref.png",
    "output/workflow-test_1783784370_d3cff910a0.png",
    "uploads/up_06c8fd090f0c_move.png",
    "uploads/up_19f3b164d97a_ai_cap.png",
    "uploads/up_359d07702154_upload.png",
    "uploads/up_3be4515355bd_caption_codex.png",
    "uploads/up_4dc46233748e_cap.png",
    "uploads/up_dd768c0041a0_ai_cls.png",
]

REMOVE_FILES = [
    DATA / "canvases" / "80cb1ff496504328a924bb2f69cfd177.json",
    DATA / "history.json.bak_mock_cleanup_20260712_000804",
    DATA / "infinite-canvas.db",
]

EMPTY_CONV_DIRS = [
    DATA / "conversations" / "0d8ef886-4b05-4d2a-ac4a-379695daf0ca",
    DATA / "conversations" / "default",
]


def archive_path(src: Path) -> Path:
    rel = src.relative_to(DATA)
    dest = ARCHIVE / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
    else:
        shutil.copy2(src, dest)
    return dest


def main() -> None:
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    removed: list[str] = []
    kept_note: list[str] = []

    for user in sorted(TEST_CONV_USERS):
        conv_dir = DATA / "conversations" / user
        if conv_dir.is_dir():
            archive_path(conv_dir)
            shutil.rmtree(conv_dir)
            removed.append(str(conv_dir.relative_to(DATA)))

    for conv_dir in EMPTY_CONV_DIRS:
        if conv_dir.is_dir() and not any(conv_dir.iterdir()):
            conv_dir.rmdir()
            removed.append(f"{conv_dir.relative_to(DATA)}/ (empty dir)")

    for rel in REMOVE_OBJECT_KEYS:
        obj = DATA / "objects" / rel.replace("/", "\\")
        if obj.is_file():
            archive_path(obj)
            obj.unlink()
            removed.append(f"objects/{rel}")

    for f in REMOVE_FILES:
        if f.is_file():
            archive_path(f)
            f.unlink()
            removed.append(str(f.relative_to(DATA)))

    history_path = DATA / "history.json"
    if history_path.is_file():
        entries = json.loads(history_path.read_text(encoding="utf-8"))
        before = len(entries)
        cleaned = [e for e in entries if e.get("type") != "workflow-test"]
        if len(cleaned) != before:
            archive_path(history_path)
            history_path.write_text(
                json.dumps(cleaned, ensure_ascii=False, indent=4) + "\n",
                encoding="utf-8",
            )
            removed.append("history.json: removed workflow-test entry")

    tmp = DATA / "objects" / ".tmp"
    if tmp.is_dir() and not any(tmp.rglob("*")):
        tmp.rmdir()
        removed.append("objects/.tmp/ (empty)")

    kept_note.extend(
        [
            "api_providers.json",
            "app_secrets.json",
            "asset_library.json",
            "projects.json",
            "prompt_libraries.json",
            "history.json (2 online generation records)",
            "conversations/ffddca63-dd44-4090-a0d6-40d98a4b72d9/ (3 sessions)",
            "objects/output/online_*.png (6 images)",
            "objects/output/chat_*.png (2 images, referenced by chat)",
        ]
    )

    manifest = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "storage_backend_at_cleanup": "json",
        "archive_dir": str(ARCHIVE.relative_to(ROOT)),
        "removed_count": len(removed),
        "removed": removed,
        "kept": kept_note,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
