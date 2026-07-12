import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Upload, Zap } from "lucide-react";
import { api } from "../../../shared/api/client";
import { formatApiError } from "../../../shared/api/formatError";
import { HistoryMasonry } from "../../../shared/components/HistoryMasonry";
import { Lightbox } from "../../../shared/components/Lightbox";
import { StudioWorkbenchLayout } from "../../../shared/components/StudioWorkbenchLayout";
import { UploadZone } from "../../../shared/components/UploadZone";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import { rangeFillStyle } from "../../../shared/utils/rangeFillStyle";
import type { AiConfig } from "../../chat/types";
import { buildAngleCommand, mergeAngleIntoPrompt } from "../shared/anglePrompt";
import {
  persistAngleCloudModel,
  persistAngleEngine,
  resolveAngleCloudModel,
  resolveAngleCloudModels,
  resolveAngleEngine,
} from "../shared/angleOptions";
import { CameraPreview } from "../shared/CameraPreview";
import { EngineSwitch, type ToolEngine } from "../shared/EngineSwitch";
import { ToolResultStage } from "../shared/ToolResultStage";
import { WorkbenchSection } from "../shared/WorkbenchSection";
import { useWorkflowAvailability } from "../shared/useWorkflowAvailability";
import { WorkflowAvailabilityHint } from "../shared/WorkflowAvailabilityHint";
import { WorkflowExportButton } from "../shared/WorkflowExportButton";
import {
  angleGenerate,
  anglePollStatus,
  comfyGenerate,
  fetchModelScopeToken,
  fileToDataUri,
  firstImageUrl,
  uploadToComfy,
} from "../shared/toolClient";

const ANGLE_WORKFLOW = "2511.json";

export function AnglePage() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [rotateH, setRotateH] = useState(0);
  const [rotateV, setRotateV] = useState(0);
  const [distance, setDistance] = useState(4);
  const [engine, setEngine] = useState<ToolEngine>(() => resolveAngleEngine());
  const [cloudModel, setCloudModel] = useState(resolveAngleCloudModel(undefined));
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { availability, localReady } = useWorkflowAvailability(ANGLE_WORKFLOW, engine === "local");

  const angleCommand = buildAngleCommand(rotateH, rotateV, distance);

  const { data: config } = useQuery({
    queryKey: ["angle-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const cloudModels = useMemo(() => resolveAngleCloudModels(config), [config]);

  useEffect(() => {
    setCloudModel((prev) => resolveAngleCloudModel(config, prev));
  }, [config]);

  useEffect(() => {
    if (!angleCommand) return;
    setPrompt((current) => mergeAngleIntoPrompt(current, angleCommand));
  }, [rotateH, rotateV, distance]); // eslint-disable-line react-hooks/exhaustive-deps -- mirror history auto-prompt sync

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleEngineChange = (next: ToolEngine) => {
    setEngine(next);
    persistAngleEngine(next);
  };

  const handleCloudModelChange = (value: string) => {
    setCloudModel(value);
    persistAngleCloudModel(value);
  };

  const handleUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setUploadedFile(file);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    try {
      const uploaded = await uploadToComfy([file]);
      const comfyName = uploaded[0]?.comfy_name;
      if (!comfyName) throw new Error(t("studio.uploadFailed"));
      setUploadedPath(comfyName);
    } catch (err) {
      setUploadedPath("");
      setError(formatApiError(err, t("studio.uploadFailed")));
    }
  };

  const clearUpload = () => {
    setUploadedFile(null);
    setUploadedPath("");
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const runCloud = async () => {
    if (!uploadedFile) throw new Error(t("studio.dropImage"));
    const token = await fetchModelScopeToken();
    if (!token) throw new Error(t("studio.modelscopeTokenRequired"));
    const dataUri = await fileToDataUri(uploadedFile);
    const model = cloudModel || resolveAngleCloudModel(config);

    let response = await angleGenerate({
      prompt,
      image_urls: [dataUri],
      model,
      api_key: token,
    });

    while (response.status === "timeout" && response.task_id) {
      const keepWaiting = window.confirm(t("studio.angleTimeoutContinue"));
      if (!keepWaiting) throw new Error("cancelled");
      response = await anglePollStatus(response.task_id, token);
    }

    return response.url ?? null;
  };

  const runLocal = async () => {
    if (!uploadedPath) throw new Error(t("studio.dropImage"));
    const data = await comfyGenerate({
      workflow_json: "2511.json",
      type: "angle",
      params: {
        "31": { image: uploadedPath },
        "11": { prompt },
        "14": { seed: Math.floor(Math.random() * 1_000_000_000_000_000) },
      },
    });
    return firstImageUrl(data);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    if (engine === "local" && !uploadedPath) {
      setError(t("studio.dropImage"));
      return;
    }
    if (engine === "cloud" && !uploadedFile) {
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
      await queryClient.invalidateQueries({ queryKey: ["history", "angle"] });
    } catch (err) {
      setError(formatApiError(err, t("studio.generateFailed")));
    } finally {
      setLoading(false);
    }
  };

  const sidebar = (
    <>
      <WorkbenchSection title={t("studio.inputSource")}>
        <UploadZone
          testId="angle-upload"
          multiple={false}
          onFiles={handleUpload}
          className="studio-tool-ref-slot p-0 min-h-0 text-center"
        >
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="" data-testid="angle-input-thumb" />
              <button
                type="button"
                className="studio-tool-ref-slot-clear"
                onClick={(event) => {
                  event.stopPropagation();
                  clearUpload();
                }}
                aria-label={t("common.cancel")}
                data-testid="angle-upload-clear"
              >
                ×
              </button>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 text-[var(--muted)]" />
              <span className="studio-tool-ref-slot-label">{t("studio.dropImage")}</span>
            </>
          )}
        </UploadZone>
      </WorkbenchSection>

      <WorkbenchSection title={t("studio.cameraControl")}>
        <div className="studio-tool-camera-panel">
          <CameraPreview
            imageUrl={previewUrl}
            rotation={rotateH}
            pitch={rotateV}
            distance={distance}
          />
          <div className="studio-tool-camera-controls">
            <label className="studio-tool-range-row">
              <span className="studio-tool-range-label">{t("studio.rotation")}</span>
              <input
                type="range"
                min={-90}
                max={90}
                value={rotateH}
                style={rangeFillStyle(rotateH, -90, 90)}
                onChange={(e) => setRotateH(Number(e.target.value))}
                data-testid="angle-rotation"
              />
              <span className="studio-tool-range-value">{rotateH}</span>
            </label>
            <label className="studio-tool-range-row">
              <span className="studio-tool-range-label">{t("studio.pitch")}</span>
              <input
                type="range"
                min={-90}
                max={90}
                value={rotateV}
                style={rangeFillStyle(rotateV, -90, 90)}
                onChange={(e) => setRotateV(Number(e.target.value))}
                data-testid="angle-pitch"
              />
              <span className="studio-tool-range-value">{rotateV}</span>
            </label>
            <label className="studio-tool-range-row">
              <span className="studio-tool-range-label">{t("studio.distance")}</span>
              <input
                type="range"
                min={0.1}
                max={8}
                step={0.1}
                value={distance}
                style={rangeFillStyle(distance, 0.1, 8)}
                onChange={(e) => setDistance(Number(e.target.value))}
                data-testid="angle-distance"
              />
              <span className="studio-tool-range-value">{distance.toFixed(1)}</span>
            </label>
            <button
              type="button"
              className="studio-tool-link-btn"
              onClick={() => {
                setRotateH(0);
                setRotateV(0);
                setDistance(4);
              }}
              data-testid="angle-reset"
            >
              {t("studio.reset")}
            </button>
            <p className="studio-tool-command-hint" data-testid="angle-command">
              {t("studio.generatedCommand")}: {angleCommand || "—"}
            </p>
          </div>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title={t("studio.inputPrompt")}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("studio.inputPrompt")}
          className="studio-tool-textarea"
          data-testid="angle-prompt"
        />
      </WorkbenchSection>

      <EngineSwitch value={engine} onChange={handleEngineChange} testId="angle-engine" />

      {engine === "cloud" ? (
        <WorkbenchSection title={t("studio.cloudModel")}>
          <StudioSelect
            value={cloudModel}
            onChange={handleCloudModelChange}
            options={cloudModels.map((model) => ({
              value: model,
              label: model.split("/").pop() ?? model,
            }))}
            data-testid="angle-cloud-model"
          />
        </WorkbenchSection>
      ) : (
        <WorkbenchSection title={t("studio.localWorkflow")}>
          <WorkflowExportButton workflow={ANGLE_WORKFLOW} testId="angle-workflow-export" />
          <WorkflowAvailabilityHint availability={availability} testId="angle-availability-hint" />
        </WorkbenchSection>
      )}

      {error ? (
        <p className="text-sm text-red-600" data-testid="angle-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="studio-tool-primary-btn"
        disabled={
          loading ||
          !prompt.trim() ||
          (engine === "local" && !localReady)
        }
        onClick={handleSubmit}
        data-testid="angle-submit"
      >
        <Zap className="w-4 h-4 text-yellow-400" />
        {loading ? t("studio.processing") : t("studio.generateAngle")}
      </button>
    </>
  );

  return (
    <>
      <StudioWorkbenchLayout
        title={t("tools.angle")}
        backTo="/tools"
        testId="angle-page"
        sidebar={sidebar}
        main={
          <ToolResultStage
            resultUrl={result}
            loading={loading}
            onPreview={setPreview}
            itemTitle={t("tools.angle")}
            testId="angle-result"
          />
        }
        footer={
          <>
            <h2 className="studio-tool-archives-title">{t("studio.archives")}</h2>
            <HistoryMasonry type="angle" onPreview={setPreview} testId="angle-history" />
          </>
        }
      />
      {preview ? <Lightbox url={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}
