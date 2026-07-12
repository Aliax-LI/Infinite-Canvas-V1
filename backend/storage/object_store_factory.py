"""ObjectStore singleton factory."""

from __future__ import annotations

from functools import lru_cache

from backend.storage.local_object_store import LocalObjectStore
from backend.storage.object_store import ObjectStore


@lru_cache(maxsize=1)
def get_object_store() -> ObjectStore:
    from backend.config import OBJECTS_DIR

    return LocalObjectStore(OBJECTS_DIR)


def reset_object_store() -> None:
    get_object_store.cache_clear()
