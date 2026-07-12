import type { ReactNode } from "react";
import { Layout, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolResultActions } from "./ToolResultActions";

interface ToolResultStageProps {
  /** Single result (backward compatible). Ignored when `resultUrls` is non-empty. */
  resultUrl?: string | null;
  /** Multi-image results (finals first). Prefer this for control / batch workflows. */
  resultUrls?: string[] | null;
  loading: boolean;
  loadingLabel?: string;
  onPreview?: (url: string, context?: { urls: string[]; index: number }) => void;
  testId?: string;
  empty?: ReactNode;
  /** Label for canvas/library import nodes */
  itemTitle?: string;
  showResultActions?: boolean;
}

function resultGridClass(count: number): string {
  const base = "studio-online-result-grid grid gap-3 justify-items-center content-center";
  if (count <= 1) return `${base} studio-online-result-grid--single`;
  const bounded = `${base} studio-online-result-grid--bounded`;
  if (count === 2) return `${bounded} studio-online-result-grid--duo grid-cols-1 sm:grid-cols-2`;
  return `${bounded} studio-online-result-grid--quad grid-cols-2`;
}

export function ToolResultStage({
  resultUrl = null,
  resultUrls = null,
  loading,
  loadingLabel,
  onPreview,
  testId = "tool-result-stage",
  empty,
  itemTitle,
  showResultActions = true,
}: ToolResultStageProps) {
  const { t } = useTranslation("studio");
  const urls =
    Array.isArray(resultUrls) && resultUrls.length > 0
      ? resultUrls.filter(Boolean)
      : resultUrl
        ? [resultUrl]
        : [];
  const hasResult = urls.length > 0;

  return (
    <div className="studio-workbench-stage" data-testid={testId}>
      {!loading && !hasResult ? (
        empty ?? (
          <div className="studio-tool-stage-empty" data-testid={`${testId}-empty`}>
            <Layout className="w-10 h-10 opacity-25" strokeWidth={1} />
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[var(--muted)]">
              {t("online.canvasReady")}
            </p>
          </div>
        )
      ) : null}

      {loading ? (
        <div className="studio-tool-stage-loading" data-testid={`${testId}-loading`}>
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[var(--muted)]">
            {loadingLabel ?? t("studio.processing")}
          </p>
        </div>
      ) : null}

      {hasResult && !loading && showResultActions ? (
        <ToolResultActions
          urls={urls}
          itemTitle={itemTitle}
          testId={`${testId}-actions`}
          showDownload={urls.length === 1}
        />
      ) : null}

      {hasResult && !loading ? (
        urls.length === 1 ? (
          <div className="studio-tool-stage-result" data-testid={`${testId}-result`}>
            <img
              src={urls[0]}
              alt="result"
              className="studio-tool-stage-image"
              onClick={() => onPreview?.(urls[0], { urls, index: 0 })}
            />
          </div>
        ) : (
          <div className={resultGridClass(urls.length)} data-testid={`${testId}-result-grid`}>
            {urls.map((url, idx) => (
              <button
                key={`${url}-${idx}`}
                type="button"
                className="studio-online-preview-slot studio-tool-stage-grid-slot"
                onClick={() => onPreview?.(url, { urls, index: idx })}
                data-testid={`${testId}-img-${idx}`}
              >
                <img src={url} alt="" className="w-full h-full object-contain cursor-pointer" />
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
