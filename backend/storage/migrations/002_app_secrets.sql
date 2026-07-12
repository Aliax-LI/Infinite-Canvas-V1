-- Dedicated secrets store for API keys and related credentials.
-- Values live in the user data directory (local desktop trust boundary).
-- Provider documents intentionally exclude raw keys; list APIs expose has_key / key_preview only.

CREATE TABLE IF NOT EXISTS app_secrets (
    name        TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
