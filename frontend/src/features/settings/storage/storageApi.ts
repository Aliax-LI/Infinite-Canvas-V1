import { api } from "../../../shared/api/client";

export type StorageStats = {
  data_dir: string;
  database_path: string;
  database_bytes: number;
  objects_dir: string;
  object_count: number;
  objects_bytes: number;
  orphan_count: number;
  orphan_bytes: number;
  storage_backend: string;
};

export type StorageHealth = {
  storage_backend: string;
  ok: boolean;
  database: {
    ok: boolean;
    exists: boolean;
    integrity?: string;
    schema_version?: number;
    target_schema_version?: number;
  };
};

export type StorageBackupItem = {
  backup_dir: string;
  name: string;
  created_at_ms: number;
  meta?: Record<string, unknown>;
};

export type StorageBackupList = {
  backups: StorageBackupItem[];
};

export type StorageBackupResult = {
  ok: boolean;
  backup_dir: string;
  meta?: Record<string, unknown>;
};

export type StorageRestoreResult = {
  ok: boolean;
  restored_from: string;
  safety_backup_dir?: string;
  message?: string;
};

export function fetchStorageStats() {
  return api.get<StorageStats>("/api/storage/stats");
}

export function fetchStorageHealth() {
  return api.get<StorageHealth>("/api/storage-health");
}

export function fetchStorageBackups() {
  return api.get<StorageBackupList>("/api/storage/backups");
}

export function createStorageBackup() {
  return api.post<StorageBackupResult>("/api/storage/backup", {});
}

export function restoreStorageBackup(backupDir: string) {
  return api.post<StorageRestoreResult>("/api/storage/restore", { backup_dir: backupDir });
}

declare global {
  interface Window {
    infiniteCanvasDesktop?: {
      isElectron?: boolean;
      openPath?: (path: string) => Promise<boolean>;
    };
  }
}

export async function openDataDirectory(path: string) {
  const bridge = window.infiniteCanvasDesktop;
  if (bridge?.openPath) {
    return bridge.openPath(path);
  }
  return false;
}
