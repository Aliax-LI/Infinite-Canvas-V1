import { useState } from "react";
import { FolderOpen, HardDrive, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StudioDialog } from "../../../shared/ui/StudioDialog";
import { formatBytes, formatTimestamp } from "./formatBytes";
import {
  useCreateStorageBackup,
  useRestoreStorageBackup,
  useStorageBackups,
  useStorageHealth,
  useStorageStats,
} from "./hooks";
import { openDataDirectory, type StorageBackupItem } from "./storageApi";

export function StorageSettingsPage() {
  const { t } = useTranslation("storage-settings");
  const { data: stats, isFetching: statsLoading, refetch: refetchStats } = useStorageStats();
  const { data: health, refetch: refetchHealth } = useStorageHealth();
  const { data: backupList, refetch: refetchBackups } = useStorageBackups();
  const createBackup = useCreateStorageBackup();
  const restoreBackup = useRestoreStorageBackup();
  const [pendingRestore, setPendingRestore] = useState<StorageBackupItem | null>(null);
  const [dialog, setDialog] = useState<{ title: string; message: string; variant: "success" | "error" } | null>(
    null,
  );

  const refreshAll = () => {
    void refetchStats();
    void refetchHealth();
    void refetchBackups();
  };

  const onCreateBackup = async () => {
    try {
      const result = await createBackup.mutateAsync();
      setDialog({
        title: t("backupSuccessTitle"),
        message: t("backupSuccessMessage", { path: result.backup_dir }),
        variant: "success",
      });
    } catch (err) {
      setDialog({
        title: t("backupFailedTitle"),
        message: err instanceof Error ? err.message : t("unknownError"),
        variant: "error",
      });
    }
  };

  const onConfirmRestore = async () => {
    if (!pendingRestore) return;
    try {
      const result = await restoreBackup.mutateAsync(pendingRestore.backup_dir);
      setPendingRestore(null);
      setDialog({
        title: t("restoreSuccessTitle"),
        message: t("restoreSuccessMessage", {
          from: result.restored_from,
          safety: result.safety_backup_dir || "—",
        }),
        variant: "success",
      });
    } catch (err) {
      setPendingRestore(null);
      setDialog({
        title: t("restoreFailedTitle"),
        message: err instanceof Error ? err.message : t("unknownError"),
        variant: "error",
      });
    }
  };

  const healthOk = health?.ok ?? false;
  const backups = backupList?.backups ?? [];

  return (
    <div className="studio-settings-native" data-testid="storage-settings-page">
      <div className="studio-settings-about-grid">
        <section className="studio-settings-card">
          <div className="studio-settings-card-head">
            <div>
              <div className="studio-settings-card-title">{t("overviewTitle")}</div>
              <p className="studio-settings-card-desc">{t("overviewDesc")}</p>
            </div>
            <div className="studio-settings-card-icon">
              <HardDrive aria-hidden />
            </div>
          </div>
          <div className="studio-meta-list">
            <div className="studio-meta-row">
              <span>{t("dataDirectory")}</span>
              <strong>{stats?.data_dir ?? "—"}</strong>
            </div>
            <div className="studio-meta-row">
              <span>{t("storageBackend")}</span>
              <strong>{stats?.storage_backend ?? health?.storage_backend ?? "—"}</strong>
            </div>
            <div className="studio-meta-row">
              <span>{t("databaseSize")}</span>
              <strong>{formatBytes(stats?.database_bytes ?? 0)}</strong>
            </div>
            <div className="studio-meta-row">
              <span>{t("objectsSize")}</span>
              <strong>
                {formatBytes(stats?.objects_bytes ?? 0)} · {stats?.object_count ?? 0} {t("objectsUnit")}
              </strong>
            </div>
            <div className="studio-meta-row">
              <span>{t("orphanObjects")}</span>
              <strong>
                {stats?.orphan_count ?? 0} · {formatBytes(stats?.orphan_bytes ?? 0)}
              </strong>
            </div>
            <div className="studio-meta-row">
              <span>{t("healthStatus")}</span>
              <strong className={healthOk ? "is-ok" : "is-warn"}>{healthOk ? t("healthy") : t("needsAttention")}</strong>
            </div>
          </div>
          <div className="studio-row-actions">
            <button type="button" className="studio-action-btn" onClick={refreshAll} disabled={statsLoading}>
              <RefreshCw aria-hidden />
              {t("refresh")}
            </button>
            {stats?.data_dir && (
              <button
                type="button"
                className="studio-action-btn"
                onClick={() => void openDataDirectory(stats.data_dir)}
              >
                <FolderOpen aria-hidden />
                {t("openDataDir")}
              </button>
            )}
          </div>
        </section>

        <section className="studio-settings-card">
          <div className="studio-settings-card-head">
            <div>
              <div className="studio-settings-card-title">{t("backupTitle")}</div>
              <p className="studio-settings-card-desc">{t("backupDesc")}</p>
            </div>
          </div>
          <div className="studio-row-actions">
            <button
              type="button"
              className="studio-action-btn primary"
              data-testid="storage-create-backup-btn"
              onClick={() => void onCreateBackup()}
              disabled={createBackup.isPending}
            >
              <Save aria-hidden />
              {createBackup.isPending ? t("backingUp") : t("createBackup")}
            </button>
          </div>
          {backups.length > 0 ? (
            <div className="studio-meta-list" style={{ marginTop: 16 }}>
              {backups.map((item) => (
                <div className="studio-meta-row" key={item.backup_dir}>
                  <span>{formatTimestamp(item.created_at_ms)}</span>
                  <div className="studio-row-actions" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      className="studio-action-btn"
                      data-testid={`storage-restore-btn-${item.name}`}
                      onClick={() => setPendingRestore(item)}
                      disabled={restoreBackup.isPending}
                    >
                      <RotateCcw aria-hidden />
                      {t("restore")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="studio-settings-card-desc" style={{ marginTop: 12 }}>
              {t("noBackups")}
            </p>
          )}
        </section>
      </div>

      <StudioDialog
        open={Boolean(pendingRestore)}
        title={t("restoreConfirmTitle")}
        variant="warning"
        data-testid="storage-restore-dialog"
        primaryAction={{
          label: restoreBackup.isPending ? t("restoring") : t("restoreConfirm"),
          onClick: () => void onConfirmRestore(),
          testId: "storage-restore-confirm",
        }}
        secondaryAction={{
          label: t("cancel"),
          onClick: () => setPendingRestore(null),
          testId: "storage-restore-cancel",
        }}
        onClose={() => setPendingRestore(null)}
      >
        <p>{t("restoreConfirmMessage", { name: pendingRestore?.name ?? "" })}</p>
      </StudioDialog>

      <StudioDialog
        open={Boolean(dialog)}
        title={dialog?.title ?? ""}
        variant={dialog?.variant ?? "info"}
        primaryAction={{ label: t("close"), onClick: () => setDialog(null) }}
        onClose={() => setDialog(null)}
      >
        <p>{dialog?.message}</p>
      </StudioDialog>
    </div>
  );
}
