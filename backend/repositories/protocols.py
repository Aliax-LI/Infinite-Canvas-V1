"""Repository protocol definitions for structured data persistence.

Each protocol mirrors one business domain. Json* implementations (Phase 1)
preserve current on-disk JSON behavior; Sqlite* implementations arrive in Phase 2.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ProjectRepository(ABC):
    @abstractmethod
    def load_all(self) -> list[dict[str, Any]]:
        """Return raw project records from storage."""

    @abstractmethod
    def save_all(self, projects: list[dict[str, Any]]) -> None:
        """Persist the full project list."""

    @abstractmethod
    def reassign_canvases(self, from_project_id: str, to_project_id: str) -> int:
        """Move canvases between projects. Returns number of canvases updated."""


class CanvasRepository(ABC):
    @abstractmethod
    def load(self, canvas_id: str) -> dict[str, Any]:
        """Load a canvas document by id."""

    @abstractmethod
    def load_any(self, canvas_id: str) -> dict[str, Any]:
        """Load a canvas document including trashed canvases."""

    @abstractmethod
    def save(self, canvas: dict[str, Any], *, touch_updated_at: bool = True) -> None:
        """Persist a canvas document."""

    @abstractmethod
    def delete_file(self, canvas_id: str) -> None:
        """Permanently remove a canvas file."""

    @abstractmethod
    def list_documents(self, *, include_deleted: bool = False) -> list[dict[str, Any]]:
        """Return full canvas documents matching the deleted filter."""

    @abstractmethod
    def cleanup_expired_trash(self, retention_ms: int) -> None:
        """Permanently delete canvases past trash retention."""

    @abstractmethod
    def reassign_project(self, from_project_id: str, to_project_id: str) -> int:
        """Update project field on all matching canvases. Returns count updated."""


class ConversationRepository(ABC):
    @abstractmethod
    def load(self, user_id: str, conversation_id: str) -> dict[str, Any]:
        """Load one conversation."""

    @abstractmethod
    def save(self, user_id: str, conversation: dict[str, Any]) -> None:
        """Persist one conversation."""

    @abstractmethod
    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        """List conversation summaries for a user."""

    @abstractmethod
    def delete(self, user_id: str, conversation_id: str) -> None:
        """Delete a conversation file."""


class HistoryRepository(ABC):
    @abstractmethod
    def load_all(self) -> list[dict[str, Any]]:
        """Load generation history records."""

    @abstractmethod
    def save_all(self, records: list[dict[str, Any]]) -> None:
        """Replace persisted history."""

    @abstractmethod
    def append(self, record: dict[str, Any]) -> None:
        """Prepend a history record."""


class AssetLibraryRepository(ABC):
    @abstractmethod
    def load(self) -> dict[str, Any]:
        """Load asset library index."""

    @abstractmethod
    def save(self, library: dict[str, Any]) -> None:
        """Persist asset library index."""


class PromptLibraryRepository(ABC):
    @abstractmethod
    def load(self) -> dict[str, Any]:
        """Load prompt libraries document."""

    @abstractmethod
    def save(self, data: dict[str, Any]) -> None:
        """Persist prompt libraries document."""


class ApiProvidersRepository(ABC):
    @abstractmethod
    def load_all(self) -> list[dict[str, Any]]:
        """Load API provider configs."""

    @abstractmethod
    def save_all(self, providers: list[dict[str, Any]]) -> None:
        """Persist API provider configs."""


class SecretsRepository(ABC):
    @abstractmethod
    def get(self, name: str) -> str | None:
        """Return secret value or None when the name is not stored."""

    @abstractmethod
    def set_many(self, updates: dict[str, str]) -> None:
        """Upsert secrets. Empty string deletes the name."""

    @abstractmethod
    def load_all(self) -> dict[str, str]:
        """Return all stored secrets as name → value."""


class SharedFoldersRepository(ABC):
    @abstractmethod
    def load(self) -> dict[str, Any]:
        """Load shared folders config."""

    @abstractmethod
    def save(self, data: dict[str, Any]) -> None:
        """Persist shared folders config."""


class RunningHubWorkflowRepository(ABC):
    @abstractmethod
    def load(self) -> dict[str, Any]:
        """Load RunningHub workflow store."""

    @abstractmethod
    def save(self, store: dict[str, Any]) -> None:
        """Persist RunningHub workflow store."""


class WorkflowRepository(ABC):
    @abstractmethod
    def list_workflows(self) -> list[str]:
        """Return relative workflow paths under the workflow root."""

    @abstractmethod
    def load_workflow(self, name: str) -> dict[str, Any]:
        """Load a workflow JSON by relative path."""

    @abstractmethod
    def save_workflow(self, name: str, workflow: dict[str, Any]) -> None:
        """Save workflow JSON."""

    @abstractmethod
    def load_config(self, name: str) -> dict[str, Any]:
        """Load workflow sidecar config if present."""

    @abstractmethod
    def save_config(self, name: str, config: dict[str, Any]) -> None:
        """Save workflow sidecar config."""

    @abstractmethod
    def workflow_exists(self, name: str) -> bool:
        """Return True if workflow JSON exists."""

    @abstractmethod
    def delete_workflow(self, name: str) -> None:
        """Delete workflow JSON and sidecar config if present."""
