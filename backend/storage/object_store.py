"""Object storage abstraction for media and generated artifacts.

Phase 1 defines the interface and data structures only.
LocalObjectStore (Phase 4) and S3ObjectStore (Phase 5) implement this contract.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, BinaryIO


class ObjectStoreError(Exception):
    """Raised when an object store operation fails."""


@dataclass(frozen=True)
class StoredObject:
    """Metadata returned after a successful put or copy."""

    object_key: str
    content_type: str
    size_bytes: int
    url: str
    sha256: str | None = None
    original_filename: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class ObjectStore(ABC):
    """Unified interface for binary object persistence."""

    @abstractmethod
    def put(
        self,
        source: bytes | BinaryIO | str,
        *,
        content_type: str,
        metadata: dict[str, Any] | None = None,
        object_key: str | None = None,
    ) -> StoredObject:
        """Write an object from bytes, a file-like, or a local filesystem path."""

    @abstractmethod
    def open(self, object_key: str) -> BinaryIO:
        """Open an object for reading."""

    @abstractmethod
    def exists(self, object_key: str) -> bool:
        """Return True if the object key resolves to stored content."""

    @abstractmethod
    def delete(self, object_key: str) -> None:
        """Remove the object. Implementations may refuse when references exist."""

    @abstractmethod
    def copy(self, source_key: str, target_key: str) -> StoredObject:
        """Copy within the same store."""

    @abstractmethod
    def resolve_url(self, object_key: str, *, expires_in: int | None = None) -> str:
        """Return a URL clients can use to fetch the object."""
