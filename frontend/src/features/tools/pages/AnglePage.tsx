import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { UploadZone } from "../../../shared/components/UploadZone";
import { ToolFormShell } from "../ToolFormShell";

export function CameraStub({
  rotation,
  pitch,
  distance,
}: {
  rotation: number;
  pitch: number;
  distance: number;
}) {
  const transform = useMemo(
    () =>
      `perspective(600px) rotateY(${rotation}deg) rotateX(${pitch}deg) translateZ(${distance}px)`,
    [rotation, pitch, distance],
  );
  return (
    <div
      className="h-48 border border-[var(--border)] bg-[var(--nav-hover-bg)] flex items-center justify-center overflow-hidden"
      data-testid="angle-camera-stub"
    >
      <div
        className="w-24 h-24 bg-black/80 transition-transform duration-200"
        style={{ transform }}
      />
    </div>
  );
}

export function AnglePage() {
  const { t } = useTranslation("studio");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [rotation, setRotation] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [distance, setDistance] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generatedCommand = `rotation=${rotation}, pitch=${pitch}, distance=${distance}`;

  return (
    <ToolFormShell
      title={t("tools.angle")}
      testId="angle-page"
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
              mode: "angle",
              image_url: imageUrl,
              rotation,
              pitch,
              distance,
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
          <p className="text-sm font-medium">{t("studio.cameraControl")}</p>
          <UploadZone
            testId="angle-upload"
            multiple={false}
            onFiles={async (files) => {
              const form = new FormData();
              form.append("files", files[0]);
              const data = await api.upload<{ files: Array<{ url: string }> }>(
                "/api/ai/upload",
                form,
              );
              if (data.files?.[0]?.url) setImageUrl(data.files[0].url);
            }}
          />
          <CameraStub rotation={rotation} pitch={pitch} distance={distance} />
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16">{t("studio.rotation")}</span>
            <input
              type="range"
              min={-180}
              max={180}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="flex-1"
              data-testid="angle-rotation"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16">{t("studio.pitch")}</span>
            <input
              type="range"
              min={-90}
              max={90}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="flex-1"
              data-testid="angle-pitch"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16">{t("studio.distance")}</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              className="flex-1"
              data-testid="angle-distance"
            />
          </label>
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:underline"
            onClick={() => {
              setRotation(0);
              setPitch(0);
              setDistance(0);
            }}
            data-testid="angle-reset"
          >
            {t("studio.reset")}
          </button>
          <p className="text-xs text-[var(--muted)]" data-testid="angle-command">
            {t("studio.generatedCommand")}: {generatedCommand}
          </p>
        </div>
      }
      history={
        <HistoryMasonry type="angle" onPreview={setPreview} testId="angle-history" />
      }
      onResultClick={setPreview}
    >
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}
    </ToolFormShell>
  );
}
