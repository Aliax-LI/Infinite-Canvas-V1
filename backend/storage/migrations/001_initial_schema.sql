-- Phase 2 initial schema (v1)
-- Structured domains: projects, canvases, conversations, providers, libraries (JSON blobs where needed).

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS canvases (
    id            TEXT PRIMARY KEY,
    project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
    document_json TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    deleted_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_canvases_project ON canvases(project_id);
CREATE INDEX IF NOT EXISTS idx_canvases_deleted ON canvases(deleted_at);

CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    document_json TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

CREATE TABLE IF NOT EXISTS history_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    record_json TEXT NOT NULL,
    timestamp   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history_records(timestamp DESC);

CREATE TABLE IF NOT EXISTS api_providers (
    id            TEXT PRIMARY KEY,
    document_json TEXT NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    enabled       INTEGER NOT NULL DEFAULT 1,
    is_primary    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prompt_libraries (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    document_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_library (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    document_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_folders (
    id          TEXT PRIMARY KEY,
    document_json TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runninghub_workflows (
    id          TEXT PRIMARY KEY,
    document_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_files (
    relative_path TEXT PRIMARY KEY,
    document_json TEXT NOT NULL,
    updated_at    INTEGER NOT NULL
);
