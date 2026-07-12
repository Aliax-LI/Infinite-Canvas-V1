"""One-shot JSON → SQLite migration (Phase 3)."""

from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from backend.config import DATA_DIR, DATABASE_PATH, MIGRATIONS_DIR
from backend.repositories.json.base import read_json_file
from backend.repositories.sqlite.api_providers_repository import SqliteApiProvidersRepository
from backend.repositories.sqlite.asset_library_repository import SqliteAssetLibraryRepository
from backend.repositories.sqlite.canvas_repository import SqliteCanvasRepository
from backend.repositories.sqlite.conversation_repository import SqliteConversationRepository
from backend.repositories.sqlite.history_repository import SqliteHistoryRepository
from backend.repositories.sqlite.project_repository import SqliteProjectRepository
from backend.repositories.sqlite.prompt_library_repository import SqlitePromptLibraryRepository
from backend.repositories.sqlite.runninghub_workflow_repository import SqliteRunningHubWorkflowRepository
from backend.repositories.sqlite.shared_folders_repository import SqliteSharedFoldersRepository
from backend.storage.database import backup_database, copy_database_file
from backend.storage.migration_manifest import build_manifest, save_manifest
from backend.storage.migration_runner import ensure_schema_current

MIGRATION_MARKER = ".sqlite_migration_complete"
MIGRATION_BACKEND_FILE = "storage_backend"


@dataclass(frozen=True)
class _DataPaths:
    data_dir: Path
    projects: Path
    asset_library: Path
    prompt_libraries: Path
    api_providers: Path
    shared_folders: Path
    runninghub_workflows: Path
    history: Path
    canvases: Path
    conversations: Path


def _data_paths(data_dir: Path) -> _DataPaths:
    return _DataPaths(
        data_dir=data_dir,
        projects=data_dir / "projects.json",
        asset_library=data_dir / "asset_library.json",
        prompt_libraries=data_dir / "prompt_libraries.json",
        api_providers=data_dir / "api_providers.json",
        shared_folders=data_dir / "shared_folders.json",
        runninghub_workflows=data_dir / "runninghub_workflows.json",
        history=data_dir / "history.json",
        canvases=data_dir / "canvases",
        conversations=data_dir / "conversations",
    )


@dataclass
class DomainStats:
    domain: str
    read: int = 0
    written: int = 0
    skipped: int = 0
    errors: int = 0


@dataclass
class MigrationReport:
    success: bool
    manifest_path: str = ""
    json_backup_dir: str = ""
    db_backup_path: str = ""
    stats: list[DomainStats] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "manifest_path": self.manifest_path,
            "json_backup_dir": self.json_backup_dir,
            "db_backup_path": self.db_backup_path,
            "stats": [s.__dict__ for s in self.stats],
            "error": self.error,
        }


def migration_complete(data_dir: Path = DATA_DIR) -> bool:
    return (data_dir / MIGRATION_MARKER).is_file()


def mark_migration_complete(data_dir: Path = DATA_DIR) -> None:
    marker = data_dir / MIGRATION_MARKER
    marker.write_text(
        json.dumps({"completed_at_ms": int(time.time() * 1000), "backend": "sqlite"}, indent=2),
        encoding="utf-8",
    )
    backend_file = data_dir / MIGRATION_BACKEND_FILE
    backend_file.write_text("sqlite\n", encoding="utf-8")


def _backup_json_tree(paths: _DataPaths, backup_root: Path) -> Path:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    dest = backup_root / f"json_backup_{stamp}"
    dest.mkdir(parents=True, exist_ok=True)
    for path in (
        paths.projects,
        paths.asset_library,
        paths.prompt_libraries,
        paths.api_providers,
        paths.shared_folders,
        paths.runninghub_workflows,
        paths.history,
    ):
        if path.is_file():
            target = dest / path.relative_to(paths.data_dir)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    if paths.canvases.is_dir():
        shutil.copytree(paths.canvases, dest / "canvases", dirs_exist_ok=True)
    if paths.conversations.is_dir():
        shutil.copytree(paths.conversations, dest / "conversations", dirs_exist_ok=True)
    return dest


def _count_stats(stats: DomainStats, *, read=0, written=0, skipped=0, errors=0) -> None:
    stats.read += read
    stats.written += written
    stats.skipped += skipped
    stats.errors += errors


def migrate_json_to_sqlite(
    *,
    data_dir: Path = DATA_DIR,
    db_path: Path = DATABASE_PATH,
    backup_dir: Path | None = None,
) -> MigrationReport:
    report = MigrationReport(success=False)
    backup_root = backup_dir or (data_dir / "backups")
    backup_root.mkdir(parents=True, exist_ok=True)

    if migration_complete(data_dir):
        report.success = True
        report.error = "already_migrated"
        return report

    try:
        paths = _data_paths(data_dir)
        manifest = build_manifest(data_dir)
        manifest_path = backup_root / f"migration_manifest_{time.strftime('%Y%m%d_%H%M%S')}.json"
        save_manifest(manifest, manifest_path)
        report.manifest_path = str(manifest_path)

        report.json_backup_dir = str(_backup_json_tree(paths, backup_root))

        if db_path.is_file():
            db_backup = backup_root / f"pre_migration_{time.strftime('%Y%m%d_%H%M%S')}.db"
            backup_database(db_path, db_backup)
            report.db_backup_path = str(db_backup)
        else:
            ensure_schema_current(db_path, MIGRATIONS_DIR)

        project_repo = SqliteProjectRepository(db_path)
        canvas_repo = SqliteCanvasRepository(db_path)
        providers_repo = SqliteApiProvidersRepository(db_path)
        prompt_repo = SqlitePromptLibraryRepository(db_path)
        asset_repo = SqliteAssetLibraryRepository(db_path)
        conv_repo = SqliteConversationRepository(db_path)
        rh_repo = SqliteRunningHubWorkflowRepository(db_path)
        shared_repo = SqliteSharedFoldersRepository(db_path)
        history_repo = SqliteHistoryRepository(db_path)

        # 1. projects
        ps = DomainStats("projects")
        raw = read_json_file(paths.projects, {})
        projects = raw.get("projects") if isinstance(raw, dict) else raw
        if isinstance(projects, list):
            valid = [p for p in projects if isinstance(p, dict) and p.get("id")]
            _count_stats(ps, read=len(valid))
            if valid:
                project_repo.save_all(valid)
                _count_stats(ps, written=len(valid))
        report.stats.append(ps)

        # 2. canvases
        cs = DomainStats("canvases")
        if paths.canvases.is_dir():
            for path in sorted(paths.canvases.glob("*.json")):
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    if not isinstance(data, dict) or not data.get("id"):
                        _count_stats(cs, skipped=1)
                        continue
                    _count_stats(cs, read=1)
                    canvas_repo.save(data, touch_updated_at=False)
                    _count_stats(cs, written=1)
                except (OSError, json.JSONDecodeError, ValueError, TypeError):
                    _count_stats(cs, errors=1)
        report.stats.append(cs)

        # 3. api providers
        ap = DomainStats("api_providers")
        providers = read_json_file(paths.api_providers, [])
        if isinstance(providers, list):
            valid = [p for p in providers if isinstance(p, dict) and p.get("id")]
            _count_stats(ap, read=len(valid))
            if valid:
                providers_repo.save_all(valid)
                _count_stats(ap, written=len(valid))
        report.stats.append(ap)

        # 4. prompt libraries
        pl = DomainStats("prompt_libraries")
        doc = read_json_file(paths.prompt_libraries, {})
        if isinstance(doc, dict) and doc:
            _count_stats(pl, read=1)
            prompt_repo.save(doc)
            _count_stats(pl, written=1)
        report.stats.append(pl)

        # 5. asset library
        al = DomainStats("asset_library")
        lib = read_json_file(paths.asset_library, {})
        if isinstance(lib, dict) and lib:
            _count_stats(al, read=1)
            asset_repo.save(lib)
            _count_stats(al, written=1)
        report.stats.append(al)

        # 6. conversations
        cv = DomainStats("conversations")
        if paths.conversations.is_dir():
            for user_dir in paths.conversations.iterdir():
                if not user_dir.is_dir():
                    continue
                user_id = user_dir.name
                for path in sorted(user_dir.glob("*.json")):
                    try:
                        data = json.loads(path.read_text(encoding="utf-8"))
                        if not isinstance(data, dict) or not data.get("id"):
                            _count_stats(cv, skipped=1)
                            continue
                        _count_stats(cv, read=1)
                        conv_repo.save(user_id, data)
                        _count_stats(cv, written=1)
                    except (OSError, json.JSONDecodeError, ValueError, TypeError):
                        _count_stats(cv, errors=1)
        report.stats.append(cv)

        # 7. shared folders + runninghub workflows
        sf = DomainStats("shared_folders")
        shared = read_json_file(paths.shared_folders, {})
        if isinstance(shared, dict) and shared:
            _count_stats(sf, read=1)
            shared_repo.save(shared)
            _count_stats(sf, written=1)
        report.stats.append(sf)

        rh = DomainStats("runninghub_workflows")
        store = read_json_file(paths.runninghub_workflows, {})
        if isinstance(store, dict) and store:
            _count_stats(rh, read=1)
            rh_repo.save(store)
            _count_stats(rh, written=1)
        report.stats.append(rh)

        # 8. history
        hs = DomainStats("history")
        records = read_json_file(paths.history, [])
        if isinstance(records, list):
            valid = [r for r in records if isinstance(r, dict)]
            _count_stats(hs, read=len(valid))
            if valid:
                history_repo.save_all(valid)
                _count_stats(hs, written=len(valid))
        report.stats.append(hs)

        ok, mismatches = verify_entity_counts(data_dir, db_path)
        if not ok:
            raise RuntimeError(f"post-migration count verification failed: {mismatches}")
        if not _verify_stats(report):
            raise RuntimeError("migration stats inconsistent")

        mark_migration_complete(data_dir)
        report.success = True
        return report
    except Exception as exc:
        report.error = str(exc)
        if report.db_backup_path and Path(report.db_backup_path).is_file():
            copy_database_file(Path(report.db_backup_path), db_path)
        return report


def _verify_stats(report: MigrationReport) -> bool:
    for stats in report.stats:
        if stats.errors > 0:
            return False
        if stats.read != stats.written + stats.skipped:
            return False
    return True


def count_json_entities(data_dir: Path = DATA_DIR) -> dict[str, int]:
    counts: dict[str, int] = {"projects": 0, "canvases": 0, "api_providers": 0, "conversations": 0, "history": 0}
    raw = read_json_file(data_dir / "projects.json", {})
    projects = raw.get("projects") if isinstance(raw, dict) else raw
    if isinstance(projects, list):
        counts["projects"] = len([p for p in projects if isinstance(p, dict) and p.get("id")])
    canvas_dir = data_dir / "canvases"
    if canvas_dir.is_dir():
        for path in canvas_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data.get("id"):
                    counts["canvases"] += 1
            except (OSError, json.JSONDecodeError, ValueError, TypeError):
                continue
    providers = read_json_file(data_dir / "api_providers.json", [])
    if isinstance(providers, list):
        counts["api_providers"] = len([p for p in providers if isinstance(p, dict) and p.get("id")])
    conv_dir = data_dir / "conversations"
    if conv_dir.is_dir():
        for path in conv_dir.rglob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data.get("id"):
                    counts["conversations"] += 1
            except (OSError, json.JSONDecodeError, ValueError, TypeError):
                continue
    records = read_json_file(data_dir / "history.json", [])
    if isinstance(records, list):
        counts["history"] = len([r for r in records if isinstance(r, dict)])
    return counts


def count_sqlite_entities(db_path: Path = DATABASE_PATH) -> dict[str, int]:
    from backend.storage.database import connect

    conn = connect(db_path)
    try:
        return {
            "projects": int(conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]),
            "canvases": int(conn.execute("SELECT COUNT(*) FROM canvases").fetchone()[0]),
            "api_providers": int(conn.execute("SELECT COUNT(*) FROM api_providers").fetchone()[0]),
            "conversations": int(conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]),
            "history": int(conn.execute("SELECT COUNT(*) FROM history_records").fetchone()[0]),
        }
    finally:
        conn.close()


def verify_entity_counts(data_dir: Path, db_path: Path) -> tuple[bool, dict[str, tuple[int, int]]]:
    json_counts = count_json_entities(data_dir)
    sqlite_counts = count_sqlite_entities(db_path)
    mismatches: dict[str, tuple[int, int]] = {}
    for key in json_counts:
        if json_counts[key] != sqlite_counts.get(key, -1):
            mismatches[key] = (json_counts[key], sqlite_counts.get(key, -1))
    return (len(mismatches) == 0, mismatches)
