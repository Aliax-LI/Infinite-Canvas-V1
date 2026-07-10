import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { UploadZone } from "../../../shared/components/UploadZone";
import { ToolFormShell } from "../ToolFormShell";

export function EnhancePage() {
  const { t } = useTranslation("studio");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [strength, setStrength] = useState(0.5);
  const [upscale, setUpscale] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ url?: string; images?: string[] }>(
        "/api/generate",
        {
          prompt,
          mode: "enhance",
          image_url: imageUrl,
          strength,
          upscale,
        },
      );
      setResult(res.url ?? res.images?.[0] ?? null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolFormShell
      title={t("tools.enhance")}
      testId="enhance-page"
      backTo="/tools"
      prompt={prompt}
      onPromptChange={setPrompt}
      loading={loading}
      onSubmit={handleSubmit}
      result={result}
      extra={
        <div className="space-y-4 mb-4">
          <UploadZone
            testId="enhance-upload"
            onFiles={async (files) => {
              const form = new FormData();
              form.append("files", files[0]);
              const data = await api.upload<{ files: Array<{ url: string }> }>(
                "/api/ai/upload",
                form,
              );
              if (data.files?.[0]?.url) setImageUrl(data.files[0].url);
            }}
            multiple={false}
          />
          {imageUrl && (
            <img
              src={imageUrl}
              alt="input"
              className="max-h-32 border border-[var(--border)]"
              data-testid="enhance-preview"
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <span className="w-24">{t("studio.refinementStrength")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="flex-1"
              data-testid="enhance-strength"
            />
            <span className="w-10 text-right">{strength.toFixed(2)}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={upscale}
              onChange={(e) => setUpscale(e.target.checked)}
              data-testid="enhance-upscale"
            />
            {t("studio.superResolution")}
          </label>
        </div>
      }
      history={
        <HistoryMasonry
          type="enhance"
          onPreview={setPreview}
          testId="enhance-history"
        />
      }
      onResultClick={setPreview}
    >
      {preview && (
        <Lightbox url={preview} onClose={() => setPreview(null)} />
      )}
    </ToolFormShell>
  );
}
