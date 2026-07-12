import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Zap } from "lucide-react";
import { api } from "../../../shared/api/client";
import { formatApiError } from "../../../shared/api/formatError";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { StudioWorkbenchLayout } from "../../../shared/components/StudioWorkbenchLayout";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import { rangeFillStyle } from "../../../shared/utils/rangeFillStyle";
import type { AiConfig } from "../../chat/types";
import { EngineSwitch, type ToolEngine } from "../shared/EngineSwitch";
import {
  KLEIN_WORKFLOW,
  alignKleinMsSize,
  buildKleinLocalParams,
  persistKleinCloudModel,
  persistKleinEngine,
  resolveKleinCloudModel,
  resolveKleinCloudModels,
  resolveKleinEngine,
} from "../shared/kleinOptions";
import { ToolResultStage } from "../shared/ToolResultStage";
import { WorkbenchSection } from "../shared/WorkbenchSection";
import { useWorkflowAvailability } from "../shared/useWorkflowAvailability";
import { WorkflowAvailabilityHint } from "../shared/WorkflowAvailabilityHint";
import { WorkflowExportButton } from "../shared/WorkflowExportButton";
import {
  comfyGenerate,
  fetchModelScopeToken,
  fileToDataUri,
  firstImageUrl,
  msGenerate,
  uploadToComfy,
} from "../shared/toolClient";

type RefSlot = {
  preview: string;
  comfyName: string;
  dataUri?: string;
};

const SLOT_LABELS = ["studio.slotMain", "studio.slotAuxA", "studio.slotAuxB"] as const;

export function KleinPage() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState<ToolEngine>(() => resolveKleinEngine());
  const [slots, setSlots] = useState<Array<RefSlot | null>>([null, null, null]);
  const [cloudModel, setCloudModel] = useState(() => resolveKleinCloudModel(undefined));
  const [loraEnabled, setLoraEnabled] = useState(false);
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { availability, localReady } = useWorkflowAvailability(KLEIN_WORKFLOW, engine === "local");

  const { data: config } = useQuery({
    queryKey: ["klein-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const cloudModels = useMemo(() => resolveKleinCloudModels(config), [config]);
  const mainSlot = slots[0];
  /** Local: 3 refs like legacy. Cloud: main only (legacy note said uses main; UI now matches). */
  const visibleSlotCount = engine === "cloud" ? 1 : 3;

  useEffect(() => {
    setCloudModel((prev) => resolveKleinCloudModel(config, prev));
  }, [config]);

  const handleEngineChange = (next: ToolEngine) => {
    setEngine(next);
    persistKleinEngine(next);
  };

  const handleCloudModelChange = (value: string) => {
    setCloudModel(value);
    persistKleinCloudModel(value);
  };

  const handleSlotUpload = useCallback(
    async (index: number, files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      try {
        const [uploaded] = await uploadToComfy([file]);
        const comfyName = uploaded?.comfy_name;
        if (!comfyName) throw new Error(t("studio.uploadFailed"));
        const dataUri = await fileToDataUri(file);
        const previewUrl = URL.createObjectURL(file);
        setSlots((prev) => {
          const next = [...prev];
          const previous = next[index];
          if (previous?.preview.startsWith("blob:")) URL.revokeObjectURL(previous.preview);
          next[index] = { preview: previewUrl, comfyName, dataUri };
          return next;
        });
      } catch (err) {
        setError(formatApiError(err, t("studio.uploadFailed")));
      }
    },
    [t],
  );

  const clearSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current?.preview.startsWith("blob:")) URL.revokeObjectURL(current.preview);
      next[index] = null;
      return next;
    });
  };

  /** Legacy: cloud size follows main image natural size (computeMsSize). */
  const resolveCloudSizeFromMain = async (): Promise<{ width: number; height: number }> => {
    if (!mainSlot?.preview) return alignKleinMsSize(0, 0);
    const img = new Image();
    img.src = mainSlot.preview;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    return alignKleinMsSize(img.naturalWidth, img.naturalHeight);
  };

  const runLocal = async () => {
    if (!mainSlot?.comfyName) throw new Error(t("studio.dropImage"));
    const data = await comfyGenerate({
      prompt,
      workflow_json: KLEIN_WORKFLOW,
      type: "klein",
      params: buildKleinLocalParams({
        prompt,
        mainImage: mainSlot.comfyName,
        auxA: slots[1]?.comfyName,
        auxB: slots[2]?.comfyName,
      }),
    });
    return firstImageUrl(data);
  };

  const runCloud = async () => {
    if (!mainSlot?.dataUri) throw new Error(t("studio.dropImage"));
    const token = await fetchModelScopeToken();
    if (!token) throw new Error(t("studio.modelscopeTokenRequired"));
    const msSize = await resolveCloudSizeFromMain();
    const model = cloudModel || resolveKleinCloudModel(config);
    const payload = {
      prompt,
      model,
      image_urls: [mainSlot.dataUri],
      width: msSize.width,
      height: msSize.height,
    } as Parameters<typeof msGenerate>[0];
    if (loraEnabled) {
      payload.loras = { "Daniel8152/Klein-enhance": loraStrength };
    }
    const data = await msGenerate(payload);
    return data.url ?? null;
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    if (!mainSlot) {
      setError(t("studio.dropImage"));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = engine === "cloud" ? await runCloud() : await runLocal();
      if (!url) throw new Error(t("studio.generateFailed"));
      setResult(url);
      await queryClient.invalidateQueries({ queryKey: ["history", "klein"] });
    } catch (err) {
      setError(formatApiError(err, t("studio.generateFailed")));
    } finally {
      setLoading(false);
    }
  };

  const slotLabels = useMemo(() => SLOT_LABELS.map((key) => t(key)), [t]);

  const sidebar = (
    <>
      <WorkbenchSection title={t("studio.inputPrompt")}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("studio.inputPrompt")}
          className="w-full min-h-28 border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"
          data-testid="klein-prompt"
        />
      </WorkbenchSection>

      <WorkbenchSection title={t("studio.referenceLayers")}>
        <div
          className={
            engine === "cloud"
              ? "studio-tool-slot-grid studio-tool-slot-grid--single"
              : "studio-tool-slot-grid"
          }
        >
          {slots.slice(0, visibleSlotCount).map((slot, index) => (
            <div
              key={index}
              className="studio-tool-ref-slot"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = () => {
                  if (input.files?.[0]) void handleSlotUpload(index, [input.files[0]]);
                };
                input.click();
              }}
              data-testid={`klein-slot-${index + 1}`}
            >
              {slot ? (
                <>
                  <img src={slot.preview} alt={slotLabels[index]} />
                  <button
                    type="button"
                    className="studio-tool-ref-slot-clear"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearSlot(index);
                    }}
                    aria-label={t("common.cancel")}
                  >
                    ×
                  </button>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-[var(--muted)]" />
                  <span className="studio-tool-ref-slot-label">{slotLabels[index]}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </WorkbenchSection>

      <EngineSwitch value={engine} onChange={handleEngineChange} testId="klein-engine" />

      {engine === "cloud" ? (
        <>
          <WorkbenchSection title={t("studio.cloudModel")}>
            <StudioSelect
              value={cloudModel}
              onChange={handleCloudModelChange}
              options={cloudModels.map((model) => ({
                value: model,
                label: model.split("/").pop() ?? model,
              }))}
              data-testid="klein-cloud-model"
            />
          </WorkbenchSection>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={loraEnabled}
                onChange={(e) => setLoraEnabled(e.target.checked)}
                data-testid="klein-lora-toggle"
              />
              {t("studio.detailLora")}
            </label>
            {loraEnabled ? (
              <label className="studio-tool-range-row">
                <span className="w-24 shrink-0">{t("studio.loraStrength")}</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={loraStrength}
                  style={rangeFillStyle(loraStrength, 0.1, 1)}
                  onChange={(e) => setLoraStrength(Number(e.target.value))}
                  className="flex-1"
                  data-testid="klein-lora"
                />
                <span className="w-10 text-right font-mono text-xs">{loraStrength.toFixed(2)}</span>
              </label>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <WorkflowExportButton workflow={KLEIN_WORKFLOW} testId="klein-workflow-export" compact />
          <WorkflowAvailabilityHint availability={availability} testId="klein-availability-hint" />
        </>
      )}

      {error ? (
        <p className="text-sm text-red-600" data-testid="klein-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="studio-tool-primary-btn"
        disabled={loading || !prompt.trim() || (engine === "local" && !localReady)}
        onClick={handleSubmit}
        data-testid="klein-submit"
      >
        <Zap className="w-4 h-4 text-yellow-400" />
        {loading ? t("studio.processing") : t("studio.executeSynthesis")}
      </button>
    </>
  );

  return (
    <>
      <StudioWorkbenchLayout
        title={t("tools.klein")}
        backTo="/tools"
        testId="klein-page"
        sidebar={sidebar}
        main={
          <ToolResultStage
            resultUrl={result}
            loading={loading}
            onPreview={setPreview}
            itemTitle={t("tools.klein")}
            testId="klein-result"
          />
        }
        footer={
          <>
            <h2 className="studio-tool-archives-title">{t("studio.archives")}</h2>
            <HistoryMasonry type="klein" onPreview={setPreview} testId="klein-history" />
          </>
        }
      />
      {preview ? <Lightbox url={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}
