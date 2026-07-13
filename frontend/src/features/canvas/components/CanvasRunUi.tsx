/**
 * Shared running / pending chrome for classic canvas nodes.
 * Aligns with studio online skeleton (gray shimmer) + subtle blue active accent.
 * Red is reserved for failed pending only.
 */
import { AlertCircle, Loader2, X } from "lucide-react";
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

/** Compact failed row (optionally collapsed duplicates). */
export function FailedOutputRow({
  error,
  count = 1,
  onDismiss,
  testId,
}: {
  error: string;
  count?: number;
  onDismiss?: () => void;
  testId?: string;
}) {
  const { t } = useTranslation("canvas");
  return (
    <div
      className="legacy-output-error-row group"
      data-testid={testId}
      data-pending-failed="1"
      data-error-count={count}
      role="alert"
    >
      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-hidden />
      <span className="legacy-output-error-text" title={error}>
        {error || t("failed")}
      </span>
      {count > 1 ? (
        <span
          className="legacy-output-error-count"
          data-testid={testId ? `${testId}-count` : undefined}
        >
          ×{count}
        </span>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="legacy-output-item-dismiss"
          aria-label={t("failedDismiss", { defaultValue: "Dismiss" })}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
}

export function PendingOutputCard({
  pending,
  width,
  now,
  onDismiss,
}: {
  pending: PendingRun;
  width: number;
  now?: number;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation("canvas");
  const elapsed = formatPendingElapsed(pending, now ?? Date.now());
  const failed = Boolean(pending.failed);
  // Keep prop for callers; slot size is CSS/grid-driven (square aspect).
  void width;

  if (failed) {
    return (
      <FailedOutputRow
        error={pending.error || t("failed")}
        testId={`output-pending-${pending.id}`}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <div
      className="legacy-output-pending-slot studio-canvas-pending-slot group"
      data-testid={`output-pending-${pending.id}`}
      data-pending-failed="0"
      role="status"
      aria-busy
      aria-label={`${t("generating")}${elapsed ? ` ${elapsed}` : ""}`}
    >
      <div className="studio-online-skeleton-base" aria-hidden />
      <div className="studio-online-skeleton-shimmer" aria-hidden />
      <div className="relative z-[1] flex flex-col items-center justify-center gap-1.5 px-2">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" aria-hidden />
        <span className="text-[10px] font-medium text-[var(--settings-muted)] tracking-wide">
          {t("pendingGenerating", { defaultValue: t("generating") })}
        </span>
      </div>
      {elapsed ? (
        <span className="legacy-output-time-pill running">{elapsed}</span>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="legacy-output-item-dismiss absolute top-1 right-1 z-[2] opacity-0 group-hover:opacity-100"
          aria-label={t("failedDismiss", { defaultValue: "Dismiss" })}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
}
