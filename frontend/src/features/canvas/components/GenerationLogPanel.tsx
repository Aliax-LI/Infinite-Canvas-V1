import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ScrollText, X } from "lucide-react";
import type { GenerationLogEntry } from "../core/generationLog";
import {
  formatRunDuration,
  resolveRunningLogDuration,
} from "../core/generationLog";
import { canvasDisplayMediaUrl } from "../core/uploadMedia";
import { cn } from "../../../shared/utils";

interface GenerationLogPanelProps {
  open: boolean;
  logs: GenerationLogEntry[];
  onClose: () => void;
}

function LogDuration({ log }: { log: GenerationLogEntry }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (log.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [log.id, log.status]);

  const ms = resolveRunningLogDuration(log, now);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums",
        log.status === "running"
          ? "bg-sky-50 text-sky-700 border border-sky-100"
          : "bg-gray-50 text-gray-600 border border-gray-100",
      )}
      data-testid={`legacy-log-duration-${log.id}`}
    >
      {log.status === "running" ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden />
      ) : null}
      {formatRunDuration(ms)}
    </span>
  );
}

function StatusChip({
  status,
  label,
}: {
  status: GenerationLogEntry["status"];
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
        status === "running" &&
          "bg-sky-50 text-sky-700 border-sky-100",
        status === "success" &&
          "bg-emerald-50/80 text-emerald-800 border-emerald-100",
        status === "failed" &&
          "bg-red-50 text-red-700 border-red-100",
      )}
    >
      {status === "running" ? (
        <Loader2 className="w-3 h-3 animate-spin mr-1 shrink-0" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}

export function GenerationLogPanel({
  open,
  logs,
  onClose,
}: GenerationLogPanelProps) {
  const { t, i18n } = useTranslation("canvas");
  if (!open) return null;

  const locale = i18n.language?.startsWith("en") ? "en-US" : "zh-CN";

  const statusLabel = (status: GenerationLogEntry["status"]) => {
    if (status === "running") return t("running");
    if (status === "failed") return t("failed");
    return t("success");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="legacy-generation-log-panel"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-medium text-black">
            <ScrollText className="w-4 h-4 shrink-0" aria-hidden />
            <h2>{t("generationLogs")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label={t("common.close", { ns: "studio", defaultValue: "Close" })}
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {logs.length === 0 ? (
            <p
              className="text-sm text-gray-500 text-center py-10"
              data-testid="legacy-log-empty"
            >
              {t("noLogs")}
            </p>
          ) : (
            logs.map((log) => (
              <article
                key={log.id}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  log.status === "running"
                    ? "border-sky-200 bg-sky-50/30"
                    : log.status === "failed"
                      ? "border-red-100 bg-white"
                      : "border-gray-200 bg-white hover:border-gray-300",
                )}
                data-testid={`legacy-log-item-${log.id}`}
                data-log-status={log.status}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <StatusChip status={log.status} label={statusLabel(log.status)} />
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-700 border border-gray-100">
                    {log.platform}
                  </span>
                  {log.model && log.model !== "-" ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-600 border border-gray-100 truncate max-w-[160px]">
                      {log.model}
                    </span>
                  ) : null}
                  <LogDuration log={log} />
                </div>
                <p className="text-[11px] text-gray-500 mb-2">
                  {new Date(log.createdAt).toLocaleString(locale)}
                  {log.status !== "running" ? (
                    <>
                      {" · "}
                      {log.outputs.length} {t("logOutputs")}
                    </>
                  ) : null}
                </p>
                {log.prompt ? (
                  <p className="text-sm text-gray-800 line-clamp-3 leading-relaxed mb-2">
                    {log.prompt}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mb-2">{t("noPromptMeta")}</p>
                )}
                {log.status === "failed" && log.error ? (
                  <p className="text-sm text-red-600 leading-relaxed mb-2" role="alert">
                    {log.error}
                  </p>
                ) : null}
                {log.outputs.length ? (
                  <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100">
                    {log.outputs.slice(0, 6).map((url) => (
                      <img
                        key={url}
                        src={canvasDisplayMediaUrl(url)}
                        alt=""
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                        loading="lazy"
                      />
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
