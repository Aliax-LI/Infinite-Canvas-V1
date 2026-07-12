"""Filesystem-backed ObjectStore (Phase 4)."""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import uuid
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import quote

from backend.storage.object_store import ObjectStore, ObjectStoreError, StoredObject

_INVALID_KEY_CHARS = ("..", "\\", "\0")


def _normalize_key(object_key: str) -> str:
    key = str(object_key or "").replace("\\", "/").strip("/")
    if not key:
        raise ObjectStoreError("object_key is required")
    for bad in _INVALID_KEY_CHARS:
        if bad in key:
            raise ObjectStoreError(f"invalid object_key: {object_key!r}")
    if key.startswith("/") or ":" in key:
        raise ObjectStoreError(f"invalid object_key: {object_key!r}")
    return key


def _guess_extension(content_type: str, original_filename: str | None) -> str:
    if original_filename and "." in original_filename:
        ext = Path(original_filename).suffix
        if ext:
            return ext
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "text/plain": ".txt",
        "application/json": ".json",
    }
    return mapping.get(content_type, "")


class LocalObjectStore(ObjectStore):
    """Store objects under a root directory; keys are relative paths like input/<uuid>.png."""

    def __init__(self, root: Path, *, url_prefix: str = "/api/objects") -> None:
        self._root = root.expanduser().resolve()
        self._url_prefix = url_prefix.rstrip("/")
        self._tmp_dir = self._root / ".tmp"
        self._root.mkdir(parents=True, exist_ok=True)
        self._tmp_dir.mkdir(parents=True, exist_ok=True)

    @property
    def root(self) -> Path:
        return self._root

    def _path_for_key(self, object_key: str) -> Path:
        key = _normalize_key(object_key)
        path = (self._root / key).resolve()
        if self._root not in path.parents and path != self._root:
            raise ObjectStoreError(f"object_key escapes store root: {object_key!r}")
        return path

    def _url_for_key(self, object_key: str) -> str:
        key = _normalize_key(object_key)
        return f"{self._url_prefix}/{quote(key, safe='/')}"

    def put(
        self,
        source: bytes | BinaryIO | str,
        *,
        content_type: str,
        metadata: dict[str, Any] | None = None,
        object_key: str | None = None,
    ) -> StoredObject:
        meta = dict(metadata or {})
        original_filename = meta.get("original_filename") if isinstance(meta.get("original_filename"), str) else None
        if object_key:
            key = _normalize_key(object_key)
            if self.exists(key):
                raise ObjectStoreError(f"object already exists: {key}")
        else:
            prefix = str(meta.get("prefix") or "uploads").strip("/") or "uploads"
            ext = _guess_extension(content_type, original_filename)
            key = f"{prefix}/{uuid.uuid4().hex}{ext}"

        dest = self._path_for_key(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._tmp_dir / f"{uuid.uuid4().hex}.part"
        sha = hashlib.sha256()
        size = 0

        try:
            if isinstance(source, (bytes, bytearray)):
                data = bytes(source)
                sha.update(data)
                size = len(data)
                tmp.write_bytes(data)
            elif isinstance(source, str):
                src_path = Path(source)
                if not src_path.is_file():
                    raise ObjectStoreError(f"source file not found: {source}")
                with open(src_path, "rb") as src, open(tmp, "wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        sha.update(chunk)
                        dst.write(chunk)
                        size += len(chunk)
            else:
                with open(tmp, "wb") as dst:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        sha.update(chunk)
                        dst.write(chunk)
                        size += len(chunk)

            os.replace(tmp, dest)
        except ObjectStoreError:
            if tmp.is_file():
                tmp.unlink(missing_ok=True)
            raise
        except OSError as exc:
            if tmp.is_file():
                tmp.unlink(missing_ok=True)
            raise ObjectStoreError(str(exc)) from exc

        return StoredObject(
            object_key=key,
            content_type=content_type,
            size_bytes=size,
            url=self._url_for_key(key),
            sha256=sha.hexdigest(),
            original_filename=original_filename,
            metadata=meta,
        )

    def open(self, object_key: str) -> BinaryIO:
        path = self._path_for_key(object_key)
        if not path.is_file():
            raise ObjectStoreError(f"object not found: {object_key}")
        return open(path, "rb")

    def exists(self, object_key: str) -> bool:
        try:
            return self._path_for_key(object_key).is_file()
        except ObjectStoreError:
            return False

    def delete(self, object_key: str) -> None:
        path = self._path_for_key(object_key)
        if path.is_file():
            path.unlink()

    def copy(self, source_key: str, target_key: str) -> StoredObject:
        src = self._path_for_key(source_key)
        if not src.is_file():
            raise ObjectStoreError(f"source not found: {source_key}")
        tgt_key = _normalize_key(target_key)
        if self.exists(tgt_key):
            raise ObjectStoreError(f"target already exists: {tgt_key}")
        tgt = self._path_for_key(tgt_key)
        tgt.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, tgt)
        stat = tgt.stat()
        return StoredObject(
            object_key=tgt_key,
            content_type="application/octet-stream",
            size_bytes=int(stat.st_size),
            url=self._url_for_key(tgt_key),
        )

    def resolve_url(self, object_key: str, *, expires_in: int | None = None) -> str:
        if not self.exists(object_key):
            raise ObjectStoreError(f"object not found: {object_key}")
        return self._url_for_key(object_key)

    def filesystem_path(self, object_key: str) -> Path:
        """Absolute path for LocalObjectStore-backed keys (internal use)."""
        return self._path_for_key(object_key)
