import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

interface ToolFormShellProps {
  title: string;
  testId: string;
  backTo: string;
  prompt: string;
  onPromptChange: (v: string) => void;
  promptPlaceholder?: string;
  loading: boolean;
  onSubmit: () => void;
  result: string | null;
  extra?: ReactNode;
  history?: ReactNode;
  onResultClick?: (url: string) => void;
  children?: ReactNode;
}

export function ToolFormShell({
  title,
  testId,
  backTo,
  prompt,
  onPromptChange,
  promptPlaceholder,
  loading,
  onSubmit,
  result,
  extra,
  history,
  onResultClick,
  children,
}: ToolFormShellProps) {
  const { t } = useTranslation("studio");

  return (
    <div className="h-full overflow-auto p-8 max-w-4xl" data-testid={testId}>
      <Link
        to={backTo}
        className="inline-flex items-center gap-2 text-sm mb-6 hover:underline"
        data-testid={`${testId}-back`}
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </Link>
      <h1 className="text-2xl font-semibold mb-6">{title}</h1>
      {extra}
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={promptPlaceholder ?? t("studio.inputPrompt")}
        className="w-full h-32 border border-[var(--border)] bg-[var(--bg)] p-3 text-sm mb-4"
        data-testid={`${testId}-prompt`}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !prompt.trim()}
        className="px-6 py-2 bg-black text-white text-sm disabled:opacity-50"
        data-testid={`${testId}-submit`}
      >
        {loading ? t("studio.processing") : t("common.submit")}
      </button>
      {result && (
        <div className="mt-6" data-testid={`${testId}-result`}>
          <img
            src={result}
            alt="result"
            className="max-w-full border border-[var(--border)] cursor-pointer"
            onClick={() => onResultClick?.(result)}
          />
        </div>
      )}
      {history && (
        <section className="mt-10">
          <h2 className="text-sm font-medium mb-3">{t("studio.archives")}</h2>
          {history}
        </section>
      )}
      {children}
    </div>
  );
}
