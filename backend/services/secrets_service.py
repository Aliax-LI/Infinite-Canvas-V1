"""Persistent API secrets (keys) — SQLite app_secrets or JSON app_secrets.json.

Resolution order for reads:
1. Dedicated secrets store (primary persistence)
2. Process environment (optional override / pre-migration bridge)

Settings page saves write to the secrets store and sync into os.environ for the
current process so legacy getenv callers keep working. Secret keys are no longer
written to api.env; existing api.env values are imported once on startup.
"""

from __future__ import annotations

import os
import re
from threading import Lock

from backend.config import API_ENV_FILE

_SECRETS_LOCK = Lock()

# Known provider / platform secret env names (also used for api.env migration).
KNOWN_SECRET_ENV_NAMES = frozenset({
    "COMFLY_API_KEY",
    "MODELSCOPE_API_KEY",
    "RUNNINGHUB_API_KEY",
    "RUNNINGHUB_WALLET_API_KEY",
    "ARK_API_KEY",
    "VOLCENGINE_ACCESS_KEY_ID",
    "VOLCENGINE_SECRET_ACCESS_KEY",
})

_CUSTOM_PROVIDER_KEY_RE = re.compile(r"^API_PROVIDER_[A-Z0-9_]+_KEY$")


def _is_secret_env_name(name: str) -> bool:
    key = str(name or "").strip()
    if not key:
        return False
    if key in KNOWN_SECRET_ENV_NAMES:
        return True
    return bool(_CUSTOM_PROVIDER_KEY_RE.fullmatch(key))


def get_secrets_repository():
    from backend.repositories import get_secrets_repository as _factory

    return _factory()


def get_secret(name: str) -> str:
    """Return secret value: store first, then os.environ fallback."""
    key = str(name or "").strip()
    if not key:
        return ""
    stored = get_secrets_repository().get(key)
    if stored is not None:
        return stored
    return os.getenv(key, "") or ""


def set_secrets(updates: dict[str, str]) -> None:
    """Persist secrets and mirror into the current process environment."""
    if not updates:
        return
    secret_updates = {
        str(k).strip(): str(v or "")
        for k, v in updates.items()
        if str(k).strip() and _is_secret_env_name(str(k).strip())
    }
    if not secret_updates:
        return
    with _SECRETS_LOCK:
        get_secrets_repository().set_many(secret_updates)
        for name, value in secret_updates.items():
            os.environ[name] = value


def hydrate_environ_from_secrets() -> None:
    """Copy stored secrets into os.environ so legacy getenv paths work."""
    with _SECRETS_LOCK:
        for name, value in get_secrets_repository().load_all().items():
            if _is_secret_env_name(name):
                os.environ[name] = value


def _parse_env_file_pairs(path) -> dict[str, str]:
    if not path.is_file():
        return {}
    pairs: dict[str, str] = {}
    try:
        for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                pairs[key] = value
    except OSError:
        return {}
    return pairs


def migrate_env_secrets_into_store() -> int:
    """Import secret keys from api.env (and current environ) into the secrets store.

    Only fills missing store entries — never overwrites an existing DB value.
    Returns number of keys imported.
    """
    candidates: dict[str, str] = {}
    for name, value in _parse_env_file_pairs(API_ENV_FILE).items():
        if _is_secret_env_name(name) and value:
            candidates[name] = value
    for name in list(KNOWN_SECRET_ENV_NAMES):
        env_val = os.getenv(name, "")
        if env_val and name not in candidates:
            candidates[name] = env_val
    for name, value in list(os.environ.items()):
        if _is_secret_env_name(name) and value and name not in candidates:
            candidates[name] = value

    if not candidates:
        return 0

    imported = 0
    with _SECRETS_LOCK:
        repo = get_secrets_repository()
        to_set: dict[str, str] = {}
        for name, value in candidates.items():
            if repo.get(name) is None:
                to_set[name] = value
                imported += 1
        if to_set:
            repo.set_many(to_set)
            for name, value in to_set.items():
                os.environ[name] = value
    return imported


def bootstrap_secrets() -> int:
    """Startup: migrate legacy env secrets → store, then hydrate environ from store."""
    imported = migrate_env_secrets_into_store()
    hydrate_environ_from_secrets()
    return imported
