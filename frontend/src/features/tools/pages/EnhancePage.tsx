import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { formatApiError } from "../../../shared/api/formatError";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { StudioWorkbenchLayout } from "../../../shared/components/StudioWorkbenchLayout";
import { UploadZone } from "../../../shared/components/UploadZone";
import { rangeFillStyle } from "../../../shared/utils/rangeFillStyle";
import { WorkbenchSection } from "../shared/WorkbenchSection";
import { ToolResultStage } from "../shared/ToolResultStage";
import { useWorkflowAvailability } from "../shared/useWorkflowAvailability";
import { WorkflowAvailabilityHint } from "../shared/WorkflowAvailabilityHint";
import { WorkflowExportButton } from "../shared/WorkflowExportButton";
import {
  blobUrlFromImage,
  comfyGenerate,
  fetchUpscaleAvailability,
  firstImageUrl,
  uploadToComfy,
} from "../shared/toolClient";

const ENHANCE_WORKFLOW = "z-image-enhance.json";
const UPSCALE_WORKFLOW = "upscale.json";

export function EnhancePage() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState("");
  const [strength, setStrength] = useState(0.5);
  const [upscale, setUpscale] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState(2048);
  const [upscaleAvailable, setUpscaleAvailable] = useState<boolean | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { availability: enhanceAvailability, localReady: enhanceReady } =
    useWorkflowAvailability(ENHANCE_WORKFLOW);
  const { availability: upscaleWorkflowAvailability } = useWorkflowAvailability(UPSCALE_WORKFLOW);

  useEffect(() => {
    let cancelled = false;
    fetchUpscaleAvailability()
      .then((data) => {
        if (cancelled) return;
        setUpscaleAvailable(data.upscale_available);
        if (!data.upscale_available) {
          setUpscale(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setUpscaleAvailable(false);
        setUpscale(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const uploaded = await uploadToComfy([file]);
      const comfyName = uploaded[0]?.comfy_name;
      if (!comfyName) throw new Error(t("studio.uploadFailed"));
      setUploadedPath(comfyName);
    } catch (err) {
      setUploadedPath("");
      setError(formatApiError(err, t("studio.uploadFailed")));
    }
  }, [t]);

  const handleSubmit = async () => {
    if (!uploadedPath) {
      setError(t("studio.dropImage"));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setLoadingLabel(t("studio.phaseEnhance"));
      const enhanceData = await comfyGenerate({
        workflow_json: "z-image-enhance.json",
        params: {
          "15": { image: uploadedPath },
          "204": { value: strength },
        },
        type: "enhance",
      });
      let finalData = enhanceData;
      const firstUrl = firstImageUrl(enhanceData);
      if (!firstUrl) throw new Error(t("studio.generateFailed"));

      if (upscale) {
        setLoadingLabel(t("studio.phaseUpscale"));
        const blob = await blobUrlFromImage(firstUrl);
        const reuploaded = await uploadToComfy([
          new File([blob], "temp_upscale_input.png", { type: "image/png" }),
        ]);
        const upscaleInput = reuploaded[0]?.comfy_name;
        if (!upscaleInput) throw new Error(t("studio.uploadFailed"));

        finalData = await comfyGenerate({
          workflow_json: "upscale.json",
          params: {
            "15": { image: upscaleInput },
            "172": { seed: Math.floor(Math.random() * 4294967295), resolution: upscaleFactor },
          },
          type: "enhance",
        });
      }

      const url = firstImageUrl(finalData);
      if (!url) throw new Error(t("studio.generateFailed"));
      setResult(url);
      await queryClient.invalidateQueries({ queryKey: ["history", "enhance"] });
    } catch (err) {
      setError(formatApiError(err, t("studio.generateFailed")));
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  };

  const sidebar = (
    <>
      <WorkbenchSection title={t("studio.inputSource")}>
        <UploadZone testId="enhance-upload" multiple={false} onFiles={handleUpload}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="input"
              className="max-h-40 mx-auto object-contain"
              data-testid="enhance-preview"
            />
          ) : null}
        </UploadZone>
      </WorkbenchSection>

      <WorkbenchSection title={t("studio.parameters")}>
        <label className="studio-tool-range-row">
          <span className="w-24 shrink-0">{t("studio.refinementStrength")}</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={strength}
            style={rangeFillStyle(strength, 0.1, 1)}
            onChange={(e) => setStrength(Number(e.target.value))}
            data-testid="enhance-strength"
          />
          <span className="w-10 text-right font-mono text-xs">{strength.toFixed(2)}</span>
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-medium">{t("studio.superResolution")}</span>
            <span className="text-xs text-[var(--muted)]">
              {upscaleAvailable === false ? null : t("studio.doublePixels")}
            </span>
            {upscaleAvailable === false ? (
              <WorkflowAvailabilityHint
                availability={upscaleWorkflowAvailability}
                testId="enhance-upscale-hint"
              />
            ) : null}
          </span>
          <input
            type="checkbox"
            checked={upscale}
            disabled={upscaleAvailable !== true}
            onChange={(e) => setUpscale(e.target.checked)}
            data-testid="enhance-upscale"
          />
        </label>

        {upscale ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`px-3 py-2 text-[10px] font-bold uppercase border ${
                upscaleFactor === 2048 ? "bg-black text-white border-black" : "border-[var(--border)]"
              }`}
              onClick={() => setUpscaleFactor(2048)}
              data-testid="enhance-upscale-2x"
            >
              {t("studio.upscale2x")}
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-[10px] font-bold uppercase border ${
                upscaleFactor === 4096 ? "bg-black text-white border-black" : "border-[var(--border)]"
              }`}
              onClick={() => setUpscaleFactor(4096)}
              data-testid="enhance-upscale-4x"
            >
              {t("studio.upscale4x")}
            </button>
          </div>
        ) : null}

        <WorkflowExportButton workflow={ENHANCE_WORKFLOW} testId="enhance-workflow-export" compact />
        {upscale ? (
          <WorkflowExportButton workflow={UPSCALE_WORKFLOW} testId="enhance-upscale-export" compact />
        ) : null}
      </WorkbenchSection>

      <WorkflowAvailabilityHint availability={enhanceAvailability} testId="enhance-availability-hint" />

      {error ? (
        <p className="text-sm text-red-600" data-testid="enhance-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="studio-tool-primary-btn"
        disabled={loading || !uploadedPath || !enhanceReady}
        onClick={handleSubmit}
        data-testid="enhance-submit"
      >
        <Zap className="w-4 h-4 text-yellow-400" />
        {loading ? loadingLabel || t("studio.processing") : t("studio.beginRemaster")}
      </button>
    </>
  );

  return (
    <>
      <StudioWorkbenchLayout
        title={t("tools.enhance")}
        backTo="/tools"
        testId="enhance-page"
        sidebar={sidebar}
        main={
          <ToolResultStage
            resultUrl={result}
            loading={loading}
            loadingLabel={loadingLabel || t("studio.computingPixels")}
            onPreview={setPreview}
            itemTitle={t("tools.enhance")}
            testId="enhance-result"
          />
        }
        footer={
          <>
            <h2 className="studio-tool-archives-title">{t("studio.archives")}</h2>
            <HistoryMasonry type="enhance" onPreview={setPreview} testId="enhance-history" />
          </>
        }
      />
      {preview ? <Lightbox url={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}
