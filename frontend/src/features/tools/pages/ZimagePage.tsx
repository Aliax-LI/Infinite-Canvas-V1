import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { ToolFormShell } from "../ToolFormShell";

export function ZimagePage() {
  const { t } = useTranslation("studio");
  const [prompt, setPrompt] = useState("");
  const [detailLora, setDetailLora] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <ToolFormShell
      title={t("tools.zimage")}
      testId="zimage-page"
      backTo="/tools"
      prompt={prompt}
      onPromptChange={setPrompt}
      loading={loading}
      onSubmit={async () => {
        setLoading(true);
        try {
          const res = await api.post<{ url?: string; images?: string[] }>(
            "/api/generate",
            { prompt, mode: "zimage", detail_lora: detailLora },
          );
          setResult(res.url ?? res.images?.[0] ?? null);
        } finally {
          setLoading(false);
        }
      }}
      result={result}
      extra={
        <label className="flex items-center gap-2 text-sm mb-4">
          <input
            type="checkbox"
            checked={detailLora}
            onChange={(e) => setDetailLora(e.target.checked)}
            data-testid="zimage-detail-lora"
          />
          {t("studio.detailLora")}
        </label>
      }
      history={
        <HistoryMasonry type="zimage" onPreview={setPreview} testId="zimage-history" />
      }
      onResultClick={setPreview}
    >
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}
    </ToolFormShell>
  );
}
