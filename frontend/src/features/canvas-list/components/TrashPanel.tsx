import { useEffect, useState } from "react";
import { CheckSquare, RotateCcw, Square, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatTime } from "../../../shared/utils";
import type { CanvasRecord, ProjectRecord } from "../../../types/api";

interface TrashPanelProps {
  open: boolean;
  canvases: CanvasRecord[];
  projects: ProjectRecord[];
  retentionDays: number;
  busy?: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onRestoreBatch: (ids: string[]) => void;
  onPurgeBatch: (ids: string[]) => void;
}

export function TrashPanel({
  open,
  canvases,
  projects,
  retentionDays,
  busy = false,
  onClose,
  onRestore,
  onPurge,
  onRestoreBatch,
  onPurgeBatch,
}: TrashPanelProps) {
  const { t } = useTranslation("canvas");
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [confirmBatchPurge, setConfirmBatchPurge] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setConfirmPurgeId(null);
      setConfirmBatchPurge(false);
    }
  }, [open]);

  useEffect(() => {
    const ids = new Set(canvases.map((c) => c.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [canvases]);

  if (!open) return null;

  const projectName = (pid?: string) =>
    projects.find((p) => p.id === (pid || "default"))?.name ?? t("untitled");

  const allSelected =
    canvases.length > 0 && canvases.every((c) => selected.has(c.id));
  const selectedIds = canvases
    .filter((c) => selected.has(c.id))
    .map((c) => c.id);
  const selectedCount = selectedIds.length;

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmBatchPurge(false);
  };

  const selectAll = () => {
    setSelected(new Set(canvases.map((c) => c.id)));
    setConfirmBatchPurge(false);
  };

  const clearSelection = () => {
    setSelected(new Set());
    setConfirmBatchPurge(false);
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col bg-[var(--settings-panel,#fff)]"
      data-testid="trash-panel"
    >
      <div className="flex items-center justify-between border-b border-[var(--settings-line,#e8e8ea)] px-6 py-4">
        <div className="flex items-center gap-2 font-medium text-[var(--settings-text,#121212)]">
          <Trash2 className="h-4 w-4" />
          {t("trash")}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-[var(--settings-line,#e8e8ea)] p-2 transition-colors hover:border-[var(--settings-accent,#111827)]"
          aria-label={t("trashClose")}
          data-testid="trash-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="border-b border-[var(--settings-line,#e8e8ea)] px-6 py-3 text-xs text-[var(--settings-muted,#6b7280)]">
        {t("trashNote", { days: retentionDays })}
      </p>

      {canvases.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--settings-line,#e8e8ea)] bg-[var(--settings-soft,#f1f4f8)] px-6 py-2.5"
          data-testid="trash-batch-bar"
        >
          <span
            className="text-xs font-semibold text-[var(--settings-muted,#6b7280)]"
            data-testid="trash-selected-count"
          >
            {t("trashSelectedCount", { count: selectedCount })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="studio-action-btn"
              disabled={busy || !canvases.length}
              onClick={allSelected ? clearSelection : selectAll}
              data-testid="trash-select-all"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allSelected ? t("trashDeselectAll") : t("trashSelectAll")}
            </button>
            <button
              type="button"
              className="studio-action-btn"
              disabled={busy || selectedCount === 0}
              onClick={() => {
                setConfirmBatchPurge(false);
                onRestoreBatch(selectedIds);
              }}
              data-testid="trash-restore-selected"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("trashRestoreSelected", { count: selectedCount })}
            </button>
            {confirmBatchPurge ? (
              <div
                className="flex flex-wrap items-center gap-2"
                data-testid="trash-batch-purge-confirm"
              >
                <span className="text-xs text-red-600">
                  {t("trashPurgeSelectedConfirm", { count: selectedCount })}
                </span>
                <button
                  type="button"
                  className="studio-action-btn danger"
                  disabled={busy}
                  onClick={() => {
                    onPurgeBatch(selectedIds);
                    setConfirmBatchPurge(false);
                  }}
                  data-testid="trash-batch-purge-yes"
                >
                  {t("purgeCanvas")}
                </button>
                <button
                  type="button"
                  className="studio-action-btn"
                  disabled={busy}
                  onClick={() => setConfirmBatchPurge(false)}
                  data-testid="trash-batch-purge-cancel"
                >
                  {t("trashCancel")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="studio-action-btn danger"
                disabled={busy || selectedCount === 0}
                onClick={() => setConfirmBatchPurge(true)}
                data-testid="trash-purge-selected"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("trashPurgeSelected", { count: selectedCount })}
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-6">
        {canvases.length === 0 ? (
          <p className="text-[var(--settings-muted,#6b7280)]">{t("trashEmpty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {canvases.map((c) => {
              const isSmart = (c.kind || "classic") === "smart";
              const isSelected = selected.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`relative border bg-[var(--settings-panel,#fff)] p-4 ${
                    isSelected
                      ? "border-[var(--settings-accent,#111827)]"
                      : "border-[var(--settings-line,#e8e8ea)]"
                  }`}
                  data-testid={`trash-card-${c.id}`}
                  data-selected={isSelected ? "true" : "false"}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        isSmart
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isSmart ? t("smartCanvasShort") : t("legacyCanvas")}
                    </span>
                    <label
                      className="inline-flex cursor-pointer items-center"
                      title={t("trashSelectItem")}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--settings-accent,#111827)]"
                        checked={isSelected}
                        disabled={busy}
                        onChange={() => toggleSelected(c.id)}
                        aria-label={t("trashSelectItem")}
                        data-testid={`trash-checkbox-${c.id}`}
                      />
                    </label>
                  </div>
                  <h3 className="mb-1 truncate font-medium text-[var(--settings-text,#121212)]">
                    {c.title}
                  </h3>
                  <p className="mb-3 text-xs text-[var(--settings-muted,#6b7280)]">
                    {projectName(c.project)} · {formatTime(c.deleted_at)}
                  </p>
                  {confirmPurgeId === c.id ? (
                    <div className="space-y-2">
                      <p className="text-xs text-red-600">{t("purgeConfirm")}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-none bg-red-600 px-2 py-1 text-xs text-white"
                          disabled={busy}
                          onClick={() => {
                            onPurge(c.id);
                            setConfirmPurgeId(null);
                          }}
                          data-testid={`trash-purge-yes-${c.id}`}
                        >
                          {t("purgeCanvas")}
                        </button>
                        <button
                          type="button"
                          className="border border-[var(--settings-line,#e8e8ea)] px-2 py-1 text-xs"
                          disabled={busy}
                          onClick={() => setConfirmPurgeId(null)}
                        >
                          {t("trashCancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 border border-[var(--settings-line,#e8e8ea)] px-2 py-1 text-xs transition-colors hover:border-[var(--settings-accent,#111827)]"
                        disabled={busy}
                        onClick={() => onRestore(c.id)}
                        data-testid={`trash-restore-${c.id}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("restoreCanvas")}
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 border border-red-200 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
                        disabled={busy}
                        onClick={() => {
                          setConfirmBatchPurge(false);
                          setConfirmPurgeId(c.id);
                        }}
                        data-testid={`trash-purge-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("purgeCanvas")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
