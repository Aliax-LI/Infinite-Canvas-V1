/**
 * Shared running / pending chrome for classic canvas nodes.
 * Aligns with studio online skeleton (gray shimmer) + subtle blue active accent.
 * Red is reserved for failed pending only.
 */
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  formatPendingElapsed,
  type PendingRun,
} from "../core/pendingOutput";
import { cn } from "../../../shared/utils";

export function NodeRunningBadge({
  elapsed,
  className,
}: {
  elapsed?: string;
  className?: string;
}) {
  const { t } = useTranslation("canvas");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] font-medium text-blue-600 tracking-wide",
        className,
      )}
      data-testid="node-running-badge"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden />
      <span>
        {t("generating")}
        {elapsed ? ` ${elapsed}` : ""}
      </span>
    </span>
  );
}

export function PendingOutputCard({
  pending,
  width,
}: {
  pending: PendingRun;
  width: number;
}) {
  const { t } = useTranslation("canvas");
  const elapsed = formatPendingElapsed(pending);
  const h = Math.max(120, Math.round(width * 0.75));
  const failed = Boolean(pending.failed);

  return (
    <div
      className={cn(
        "relative w-full rounded-lg overflow-hidden flex items-center justify-center",
        failed
          ? "border border-dashed border-red-300 bg-red-50"
          : "border border-blue-200/80 bg-gray-50 studio-canvas-pending-slot",
      )}
      style={{ height: h }}
      data-testid={`output-pending-${pending.id}`}
      data-pending-failed={failed ? "1" : "0"}
      role={failed ? "alert" : "status"}
      aria-busy={!failed}
      aria-label={
        failed
          ? pending.error || t("failed")
          : `${t("generating")}${elapsed ? ` ${elapsed}` : ""}`
      }
    >
      {!failed ? (
        <>
          <div className="studio-online-skeleton-base" aria-hidden />
          <div className="studio-online-skeleton-shimmer" aria-hidden />
          <div className="relative z-[1] flex flex-col items-center justify-center gap-2 px-2">
            <Loader2
              className="w-6 h-6 text-blue-500 animate-spin"
              aria-hidden
            />
            <span className="text-[10px] font-medium text-gray-500 tracking-wide">
              {t("pendingGenerating", { defaultValue: t("generating") })}
            </span>
            {elapsed ? (
              <span className="text-[9px] font-mono text-blue-600/90 tabular-nums">
                {elapsed}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <span className="text-[10px] text-red-600 px-2 text-center line-clamp-3">
          {pending.error || t("failed")}
        </span>
      )}
      <span
        className={cn(
          "absolute top-1 left-1 z-[2] text-[9px] px-1.5 py-0.5 rounded-md font-mono",
          failed ? "bg-red-600 text-white" : "bg-black/70 text-white",
        )}
      >
        {failed ? "!" : elapsed}
      </span>
    </div>
  );
}
