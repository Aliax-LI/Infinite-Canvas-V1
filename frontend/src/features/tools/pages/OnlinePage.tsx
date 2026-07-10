import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { UploadZone } from "../../../shared/components/UploadZone";
import { ToolFormShell } from "../ToolFormShell";

const SIZE_PRESETS = [
  { id: "1024x1024", labelKey: "online.square" },
  { id: "1024x1536", labelKey: "online.portrait" },
  { id: "1536x1024", labelKey: "online.landscape" },
];

export function OnlinePage() {
  const { t } = useTranslation("studio");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [refs, setRefs] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <ToolFormShell
      title={t("online.title")}
      testId="online-page"
      backTo="/canvases"
      prompt={prompt}
      onPromptChange={setPrompt}
      promptPlaceholder={t("online.promptPlaceholder")}
      loading={loading}
      onSubmit={async () => {
        setLoading(true);
        try {
          const res = await api.post<{ url?: string }>("/api/online-image", {
            prompt,
            engine: "api",
            kind: "image",
            size,
            quality,
            reference_images: refs.map((url) => ({ url })),
          });
          setResult(res.url ?? null);
        } finally {
          setLoading(false);
        }
      }}
      result={result}
      extra={
        <div className="space-y-4 mb-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("online.size")}</span>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
              data-testid="online-size"
            >
              {SIZE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("online.quality")}</span>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
              data-testid="online-quality"
            >
              <option value="auto">{t("online.qualityAuto")}</option>
              <option value="low">{t("online.qualityLow")}</option>
              <option value="medium">{t("online.qualityMedium")}</option>
              <option value="high">{t("online.qualityHigh")}</option>
            </select>
          </label>
          <UploadZone
            testId="online-upload"
            onFiles={async (files) => {
              const form = new FormData();
              files.forEach((f) => form.append("files", f));
              const data = await api.upload<{ files: Array<{ url: string }> }>(
                "/api/ai/upload",
                form,
              );
              setRefs((prev) => [
                ...prev,
                ...(data.files ?? []).map((f) => f.url),
              ]);
            }}
          />
        </div>
      }
      history={
        <HistoryMasonry type="online" onPreview={setPreview} testId="online-history" />
      }
      onResultClick={setPreview}
    >
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}
    </ToolFormShell>
  );
}
