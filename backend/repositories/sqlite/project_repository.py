from __future__ import annotations

from typing import Any

from backend.config import DATABASE_PATH, DEFAULT_PROJECT_ID, MIGRATIONS_DIR
from backend.repositories.protocols import ProjectRepository
from backend.storage.database import connect, transaction
from backend.storage.migration_runner import ensure_schema_current


class SqliteProjectRepository(ProjectRepository):
    def __init__(self, db_path=DATABASE_PATH) -> None:
        self._db_path = db_path
        ensure_schema_current(self._db_path, MIGRATIONS_DIR)

    def _conn(self):
        return connect(self._db_path)

    def load_all(self) -> list[dict[str, Any]]:
        conn = self._conn()
        try:
            rows = conn.execute(
                "SELECT id, name, sort_order, created_at, updated_at FROM projects ORDER BY sort_order, created_at"
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "order": row["sort_order"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
                for row in rows
            ]
        finally:
            conn.close()

    def save_all(self, projects: list[dict[str, Any]]) -> None:
        conn = self._conn()
        try:
            with transaction(conn):
                conn.execute("DELETE FROM projects")
                for project in projects:
                    if not isinstance(project, dict) or not project.get("id"):
                        continue
                    conn.execute(
                        """
                        INSERT INTO projects (id, name, sort_order, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            str(project["id"]),
                            str(project.get("name") or ""),
                            int(project.get("order") or 0),
                            int(project.get("created_at") or 0),
                            int(project.get("updated_at") or 0),
                        ),
                    )
        finally:
            conn.close()

    def reassign_canvases(self, from_project_id: str, to_project_id: str) -> int:
        conn = self._conn()
        try:
            with transaction(conn):
                cursor = conn.execute(
                    """
                    UPDATE canvases
                    SET project_id = ?, updated_at = updated_at
                    WHERE project_id = ?
                    """,
                    (to_project_id or DEFAULT_PROJECT_ID, from_project_id),
                )
                return int(cursor.rowcount or 0)
        finally:
            conn.close()
