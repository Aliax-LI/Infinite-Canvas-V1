import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { api } from "../../../shared/api/client";
import { formatApiError } from "../../../shared/api/formatError";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { StudioWorkbenchLayout } from "../../../shared/components/StudioWorkbenchLayout";
import { UploadZone } from "../../../shared/components/UploadZone";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import type { AiConfig } from "../../chat/types";
import type { WorkflowField } from "../../settings/workflows/workflowFieldUtils";
import { EngineSwitch, type ToolEngine } from "../shared/EngineSwitch";
import { ToolResultStage } from "../shared/ToolResultStage";
import { WorkbenchSection } from "../shared/WorkbenchSection";
import { useWorkflowAvailability } from "../shared/useWorkflowAvailability";
import { WorkflowAvailabilityHint } from "../shared/WorkflowAvailabilityHint";
import { WorkflowExportButton } from "../shared/WorkflowExportButton";
import {
  allImageUrls,
  comfyGenerate,
  fetchModelScopeToken,
  msGenerate,
  uploadToComfy,
} from "../shared/toolClient";
import {
  DEFAULT_ZIMAGE_CLOUD_MODEL,
  DEFAULT_ZIMAGE_WORKFLOW,
  ZIMAGE_CLOUD_MODEL_STORAGE_KEY,
  ZIMAGE_CONTROL_RESOLUTION_STORAGE_KEY,
  ZIMAGE_CONTROL_TYPE_STORAGE_KEY,
  ZIMAGE_CONTROL_TYPES,
  ZIMAGE_WORKFLOW_STORAGE_KEY,
  buildZimageLocalPayload,
  getZimageControlTypeOption,
  isHuggingfaceDownloadError,
  isOfficialZimageWorkflow,
  isZimageControlWorkflow,
  mergeZimageWorkflowOptions,
  resolveZimageCloudModel,
  resolveZimageCloudModels,
  resolveZimageControlResolution,
  resolveZimageControlType,
  resolveZimageWorkflow,
  type ZimageControlResolutionMode,
} from "../shared/zimageOptions";

interface WorkflowItem {
  name: string;
  title?: string;
}

interface WorkflowDetail {
  config?: { fields?: WorkflowField[] };
}

export function ZimagePage() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [engine, setEngine] = useState<ToolEngine>("local");
  const [workflowName, setWorkflowName] = useState(DEFAULT_ZIMAGE_WORKFLOW);
  const [cloudModel, setCloudModel] = useState(DEFAULT_ZIMAGE_CLOUD_MODEL);
  const [controlPreview, setControlPreview] = useState<string | null>(null);
  const [controlImage, setControlImage] = useState("");
  const [controlType, setControlType] = useState(() => resolveZimageControlType());
  const [controlResolution, setControlResolution] = useState<ZimageControlResolutionMode>(
    () => resolveZimageControlResolution(),
  );
  const [results, setResults] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ urls: string[]; index: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isControlWorkflow = isZimageControlWorkflow(workflowName);
  const controlTypeOption = useMemo(
    () => getZimageControlTypeOption(controlType),
    [controlType],
  );

  const { availability, localReady } = useWorkflowAvailability(
    workflowName,
    engine === "local",
  );

  const { data: config } = useQuery({
    queryKey: ["zimage-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const { data: workflowList } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.get<{ workflows: WorkflowItem[] }>("/api/workflows"),
  });

  const customWorkflows = workflowList?.workflows ?? [];
  const workflowOptions = useMemo(
    () => mergeZimageWorkflowOptions(customWorkflows),
    [customWorkflows],
  );
  const cloudModels = useMemo(() => resolveZimageCloudModels(config), [config]);

  useEffect(() => {
    setWorkflowName((prev) => resolveZimageWorkflow(customWorkflows, prev));
  }, [customWorkflows]);

  useEffect(() => {
    setCloudModel((prev) => resolveZimageCloudModel(config, prev));
  }, [config]);

  const { data: workflowDetail } = useQuery({
    queryKey: ["workflow", workflowName],
    queryFn: () =>
      api.get<WorkflowDetail>(`/api/workflows/${encodeURIComponent(workflowName)}`),
    enabled: Boolean(workflowName) && engine === "local" && !isOfficialZimageWorkflow(workflowName),
  });

  const handleWorkflowChange = (value: string) => {
    setWorkflowName(value);
    if (!isZimageControlWorkflow(value)) {
      setControlImage("");
      setControlPreview(null);
    }
    try {
      localStorage.setItem(ZIMAGE_WORKFLOW_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  };

  const handleCloudModelChange = (value: string) => {
    setCloudModel(value);
    try {
      localStorage.setItem(ZIMAGE_CLOUD_MODEL_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  };

  const handleControlTypeChange = (value: string) => {
    setControlType(value);
    try {
      localStorage.setItem(ZIMAGE_CONTROL_TYPE_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  };

  const handleControlResolutionChange = (value: string) => {
    const mode = resolveZimageControlResolution(value);
    setControlResolution(mode);
    if (mode === "512" || mode === "768" || mode === "1024") {
      const size = Number(mode);
      setWidth(size);
      setHeight(size);
    }
    try {
      localStorage.setItem(ZIMAGE_CONTROL_RESOLUTION_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const handleControlUpload = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setControlPreview(URL.createObjectURL(file));
      try {
        const uploaded = await uploadToComfy([file]);
        const comfyName = uploaded[0]?.comfy_name;
        if (!comfyName) throw new Error(t("studio.uploadFailed"));
        setControlImage(comfyName);
      } catch (err) {
        setControlImage("");
        setError(formatApiError(err, t("studio.uploadFailed")));
      }
    },
    [t],
  );

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    if (engine === "local" && isControlWorkflow && !controlImage) {
      setError(t("studio.zimageControlImageRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      let urls: string[] = [];
      if (engine === "local") {
        const selectedWorkflow = workflowName || resolveZimageWorkflow(customWorkflows);
        const configFields = workflowDetail?.config?.fields ?? [];
        let localPayload;
        try {
          localPayload = buildZimageLocalPayload(
            selectedWorkflow,
            prompt,
            width,
            height,
            configFields,
            controlImage,
            controlType,
            controlResolution,
          );
        } catch (err) {
          if (err instanceof Error && err.message === "ZIMAGE_CONTROL_IMAGE_REQUIRED") {
            throw new Error(t("studio.zimageControlImageRequired"));
          }
          throw err;
        }
        const data = await comfyGenerate({
          ...localPayload,
          prompt,
          width,
          height,
          type: "zimage",
        });
        urls = allImageUrls(data);
      } else {
        const token = await fetchModelScopeToken();
        if (!token) throw new Error(t("studio.modelscopeTokenRequired"));
        const model = cloudModel || resolveZimageCloudModel(config);
        const data = await msGenerate({
          prompt,
          model,
          width,
          height,
          size: `${width}x${height}`,
        });
        urls = data.url ? [data.url] : [];
      }
      if (!urls.length) throw new Error(t("studio.generateFailed"));
      setResults(urls);
      await queryClient.invalidateQueries({ queryKey: ["history", "zimage"] });
    } catch (err) {
      const raw = formatApiError(err, t("studio.generateFailed"));
      if (isHuggingfaceDownloadError(raw)) {
        const hint = controlTypeOption.requiresHfModels && controlTypeOption.modelHintKey
          ? t(controlTypeOption.modelHintKey)
          : t("studio.zimageHfDownloadFailed");
        setError(`${hint}\n${raw}`);
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled =
    loading ||
    !prompt.trim() ||
    (engine === "local" && isControlWorkflow && !controlImage) ||
    (engine === "local" && !localReady);

  const sidebar = (
    <>
      <WorkbenchSection title={t("studio.inputPrompt")}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("studio.inputPrompt")}
          className="w-full min-h-28 border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"
          data-testid="zimage-prompt"
        />
      </WorkbenchSection>

      <EngineSwitch value={engine} onChange={setEngine} testId="zimage-engine" />

      {engine === "local" ? (
        <WorkbenchSection title={t("studio.localWorkflow")}>
          <StudioSelect
            value={workflowName}
            onChange={handleWorkflowChange}
            options={workflowOptions.map((item) => ({
              value: item.name,
              label: item.title || item.name,
            }))}
            data-testid="zimage-workflow"
          />
          <WorkflowExportButton workflow={workflowName} testId="zimage-workflow-export" compact />
        </WorkbenchSection>
      ) : (
        <WorkbenchSection title={t("studio.cloudModel")}>
          <StudioSelect
            value={cloudModel}
            onChange={handleCloudModelChange}
            options={cloudModels.map((model) => ({
              value: model,
              label: model.split("/").pop() ?? model,
            }))}
            data-testid="zimage-cloud-model"
          />
        </WorkbenchSection>
      )}

      {engine === "local" && isControlWorkflow ? (
        <>
          <WorkbenchSection title={t("studio.zimageControlType")}>
            <StudioSelect
              value={controlType}
              onChange={handleControlTypeChange}
              options={ZIMAGE_CONTROL_TYPES.map((item) => ({
                value: item.id,
                label: t(item.labelKey),
              }))}
              data-testid="zimage-control-type"
            />
            <p className="mt-2 text-[10px] text-[var(--muted)]">
              {t(controlTypeOption.hintKey)}
            </p>
            {controlTypeOption.requiresHfModels && controlTypeOption.modelHintKey ? (
              <p className="mt-1 text-[10px] text-amber-700" data-testid="zimage-control-model-hint">
                {t(controlTypeOption.modelHintKey)}
              </p>
            ) : null}
          </WorkbenchSection>
          <WorkbenchSection title={t("studio.zimageControlImage")}>
            <UploadZone testId="zimage-control-upload" multiple={false} onFiles={handleControlUpload}>
              {controlPreview ? (
                <img
                  src={controlPreview}
                  alt={t("studio.zimageControlImage")}
                  className="max-h-40 mx-auto object-contain"
                  data-testid="zimage-control-preview"
                />
              ) : null}
            </UploadZone>
            <p className="mt-2 text-[10px] text-[var(--muted)]">
              {t("studio.zimageControlImageHint")}
            </p>
          </WorkbenchSection>
          <WorkbenchSection title={t("studio.dimensions")}>
            <StudioSelect
              value={controlResolution}
              onChange={handleControlResolutionChange}
              options={[
                { value: "follow", label: t("studio.zimageControlResFollow") },
                { value: "512", label: "512×512" },
                { value: "768", label: "768×768" },
                { value: "1024", label: "1024×1024" },
                { value: "custom", label: t("studio.zimageControlResCustom") },
              ]}
              data-testid="zimage-control-resolution"
            />
            {controlResolution === "follow" ? (
              <p className="mt-2 text-[10px] text-[var(--muted)]" data-testid="zimage-control-res-hint">
                {t("studio.zimageControlResFollowHint")}
              </p>
            ) : null}
            {controlResolution === "custom" ? (
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                <input
                  type="number"
                  min={512}
                  max={2048}
                  step={64}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-20 border-b border-[var(--border)] bg-transparent outline-none"
                  data-testid="zimage-width"
                />
                <span className="text-[var(--muted)]">×</span>
                <input
                  type="number"
                  min={512}
                  max={2048}
                  step={64}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-20 border-b border-[var(--border)] bg-transparent outline-none"
                  data-testid="zimage-height"
                />
              </div>
            ) : null}
          </WorkbenchSection>
        </>
      ) : (
        <WorkbenchSection title={t("studio.dimensions")}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="number"
              min={512}
              max={2048}
              step={64}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-20 border-b border-[var(--border)] bg-transparent outline-none"
              data-testid="zimage-width"
            />
            <span className="text-[var(--muted)]">×</span>
            <input
              type="number"
              min={512}
              max={2048}
              step={64}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-20 border-b border-[var(--border)] bg-transparent outline-none"
              data-testid="zimage-height"
            />
          </div>
        </WorkbenchSection>
      )}

      {engine === "local" ? (
        <WorkflowAvailabilityHint availability={availability} testId="zimage-availability-hint" />
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" data-testid="zimage-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="studio-tool-primary-btn"
        disabled={submitDisabled}
        onClick={handleSubmit}
        data-testid="zimage-submit"
      >
        <Zap className="w-4 h-4 text-yellow-400" />
        {loading
          ? t("studio.processing")
          : engine === "local"
            ? t("studio.renderLocal")
            : t("studio.renderCloud")}
      </button>
    </>
  );

  return (
    <>
      <StudioWorkbenchLayout
        title={t("tools.zimage")}
        backTo="/tools"
        testId="zimage-page"
        sidebar={sidebar}
        main={
          <ToolResultStage
            resultUrls={results}
            loading={loading}
            onPreview={(url, context) =>
              setPreview(context ?? { urls: [url], index: 0 })
            }
            itemTitle={t("tools.zimage")}
            testId="zimage-result"
          />
        }
        footer={
          <>
            <h2 className="studio-tool-archives-title">{t("studio.archives")}</h2>
            <HistoryMasonry
              type="zimage"
              onPreview={(url, context) =>
                setPreview(context ?? { urls: [url], index: 0 })
              }
              testId="zimage-history"
            />
          </>
        }
      />
      {preview ? (
        <Lightbox
          urls={preview.urls}
          index={preview.index}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
