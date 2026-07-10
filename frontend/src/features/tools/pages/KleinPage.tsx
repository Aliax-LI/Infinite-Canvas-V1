import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { UploadZone } from "../../../shared/components/UploadZone";
import { ToolFormShell } from "../ToolFormShell";

export function KleinPage() {
  const { t } = useTranslation("studio");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <ToolFormShell
      title={t("tools.klein")}
      testId="klein-page"
      backTo="/tools"
      prompt={prompt}
      onPromptChange={setPrompt}
      loading={loading}
      onSubmit={async () => {
        setLoading(true);
        try {
          const res = await api.post<{ url?: string; images?: string[] }>(
            "/api/generate",
            {
              prompt,
              mode: "klein",
              reference_images: refs.map((url) => ({ url })),
              lora_strength: loraStrength,
            },
          );
          setResult(res.url ?? res.images?.[0] ?? null);
        } finally {
          setLoading(false);
        }
      }}
      result={result}
      extra={
        <div className="space-y-4 mb-4">
          <p className="text-sm text-[var(--muted)]">
            {t("studio.referenceLayers")}
          </p>
          <UploadZone
            testId="klein-upload"
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
          <label className="flex items-center gap-2 text-sm">
            <span className="w-24">{t("studio.loraStrength")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={loraStrength}
              onChange={(e) => setLoraStrength(Number(e.target.value))}
              className="flex-1"
              data-testid="klein-lora"
            />
          </label>
        </div>
      }
      history={
        <HistoryMasonry type="klein" onPreview={setPreview} testId="klein-history" />
      }
      onResultClick={setPreview}
    >
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}
    </ToolFormShell>
  );
}
