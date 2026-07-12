import { useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatTime } from "../../../shared/utils";
import type { CanvasRecord, ProjectRecord } from "../../../types/api";

interface TrashPanelProps {
  open: boolean;
  canvases: CanvasRecord[];
  projects: ProjectRecord[];
  retentionDays: number;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}

export function TrashPanel({
  open,
  canvases,
  projects,
  retentionDays,
  onClose,
  onRestore,
  onPurge,
}: TrashPanelProps) {
  const { t } = useTranslation("canvas");
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  if (!open) return null;

  const projectName = (pid?: string) =>
    projects.find((p) => p.id === (pid || "default"))?.name ?? t("untitled");

  return (
    <div
      className="absolute inset-0 z-20 bg-white flex flex-col"
      data-testid="trash-panel"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2 font-medium">
          <Trash2 className="w-4 h-4" />
          {t("trash")}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 border border-gray-200 rounded-lg hover:border-black transition-colors"
          aria-label={t("reset")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="px-6 py-3 text-xs text-gray-500 border-b border-gray-100">
        {t("trashNote", { days: retentionDays })}
      </p>
      <div className="flex-1 overflow-auto p-6">
        {canvases.length === 0 ? (
          <p className="text-gray-500">{t("trashEmpty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {canvases.map((c) => {
              const isSmart = (c.kind || "classic") === "smart";
              return (
                <li
                  key={c.id}
                  className="border border-gray-200 rounded-lg p-4 bg-white relative"
                  data-testid={`trash-card-${c.id}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        isSmart
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isSmart ? t("smartCanvasShort") : t("legacyCanvas")}
                    </span>
                  </div>
                  <h3 className="font-medium truncate mb-1">{c.title}</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    {projectName(c.project)} · {formatTime(c.deleted_at)}
                  </p>
                  {confirmPurgeId === c.id ? (
                    <div className="space-y-2">
                      <p className="text-xs text-red-600">{t("purgeConfirm")}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg"
                          onClick={() => {
                            onPurge(c.id);
                            setConfirmPurgeId(null);
                          }}
                        >
                          {t("purgeCanvas")}
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 border border-gray-200 rounded-lg"
                          onClick={() => setConfirmPurgeId(null)}
                        >
                          {t("reset")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg hover:border-black"
                        onClick={() => onRestore(c.id)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t("restoreCanvas")}
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs px-2 py-1 text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                        onClick={() => setConfirmPurgeId(c.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
