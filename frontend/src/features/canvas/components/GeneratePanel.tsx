import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ImagePlus } from "lucide-react";
import { api } from "../../../shared/api/client";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import { cn } from "../../../shared/utils";
import {
  imageCapableProviders,
  pickDefaultImageProvider,
  resolveImageModel,
} from "../../chat/providers";
import type { AiConfig } from "../../chat/types";
import {
  ONLINE_RATIOS,
  ONLINE_RESOLUTIONS,
  qualityApplies,
  resolveOnlineSize,
  type OnlineRatio,
  type OnlineResolution,
} from "../../tools/pages/onlineSize";
import type { GeneratePanelSettings } from "../core/types";

const COMFY_PRESETS = [
  {
    id: "zimage",
    workflow: "z-image-t2i.json",
    type: "zimage",
    labelKey: "comfyText",
  },
  {
    id: "upscale",
    workflow: "upscale.json",
    type: "upscale",
    labelKey: "comfyEnhance",
  },
] as const;

interface GeneratePanelProps {
  generate: GeneratePanelSettings;
  setGenerate: (patch: Partial<GeneratePanelSettings>) => void;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
  onAddNode: () => void;
}

function readRatio(params: Record<string, unknown>): OnlineRatio {
  const value = String(params.ratio ?? "square");
  return ONLINE_RATIOS.some((item) => item.id === value)
    ? (value as OnlineRatio)
    : "square";
}

function readResolution(params: Record<string, unknown>): OnlineResolution {
  const value = String(params.resolution ?? "1k");
  return ONLINE_RESOLUTIONS.includes(value as OnlineResolution)
    ? (value as OnlineResolution)
    : "1k";
}

export function GeneratePanel({
  generate,
  setGenerate,
  generating,
  generateError,
  onGenerate,
  onAddNode,
}: GeneratePanelProps) {
  const { t } = useTranslation(["canvas", "studio"]);
  const params = generate.params;

  const { data: config } = useQuery({
    queryKey: ["legacy-canvas-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const imageProviders = useMemo(
    () => imageCapableProviders(config),
    [config],
  );

  const providerId = String(params.provider_id ?? "");
  const model = String(params.model ?? "");
  const ratio = readRatio(params);
  const resolution = readResolution(params);
  const quality = String(params.quality ?? "auto");
  const count = Math.max(1, Math.min(4, Number(params.n ?? 1) || 1));
  const engine = generate.engine === "comfy" ? "comfy" : "api";

  const models = useMemo(() => {
    const provider = imageProviders.find((item) => item.id === providerId);
    return provider?.image_models?.length
      ? provider.image_models
      : config?.image_models ?? [];
  }, [imageProviders, providerId, config]);

  const selectedProvider = imageProviders.find((item) => item.id === providerId);
  const showQuality = qualityApplies(selectedProvider?.protocol, providerId);
  const size = resolveOnlineSize(ratio, resolution);

  useEffect(() => {
    if (!config || engine !== "api") return;
    const nextProvider = pickDefaultImageProvider(
      config,
      providerId || undefined,
    );
    const nextModel = resolveImageModel(config, nextProvider, model || undefined);
    if (nextProvider === providerId && nextModel === model) return;
    setGenerate({
      params: {
        ...params,
        provider_id: nextProvider,
        model: nextModel,
        size: resolveOnlineSize(readRatio(params), readResolution(params)),
        quality: params.quality ?? "auto",
        n: params.n ?? 1,
        ratio: params.ratio ?? "square",
        resolution: params.resolution ?? "1k",
      },
    });
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps -- sync once when config loads

  const patchParams = (patch: Record<string, unknown>) => {
    setGenerate({ params: { ...params, ...patch } });
  };

  const setEngine = (next: "api" | "comfy") => {
    if (next === engine) return;
    if (next === "comfy") {
      const preset = COMFY_PRESETS[0];
      setGenerate({
        engine: "comfy",
        params: {
          ...params,
          workflow_json: params.workflow_json ?? preset.workflow,
          type: params.type ?? preset.type,
        },
      });
      return;
    }
    setGenerate({
      engine: "api",
      params: {
        ...params,
        provider_id: providerId || pickDefaultImageProvider(config, ""),
        model: model || resolveImageModel(config, providerId, ""),
        size,
        quality,
        n: count,
        ratio,
        resolution,
      },
    });
  };

  const providerOptions = useMemo(
    () =>
      imageProviders.length === 0
        ? [{ value: "", label: t("noApiProviders"), disabled: true }]
        : imageProviders.map((provider) => ({
            value: provider.id,
            label: provider.name || provider.id,
          })),
    [imageProviders, t],
  );

  const modelOptions = useMemo(
    () =>
      models.length === 0
        ? [{ value: "", label: t("noModelsHint"), disabled: true }]
        : models.map((item) => ({ value: item, label: item })),
    [models, t],
  );

  const ratioOptions = useMemo(
    () =>
      ONLINE_RATIOS.map((item) => ({
        value: item.id,
        label: t(item.labelKey, { ns: "studio" }),
      })),
    [t],
  );

  const resolutionOptions = useMemo(
    () => ONLINE_RESOLUTIONS.map((item) => ({ value: item, label: item.toUpperCase() })),
    [],
  );

  const qualityOptions = useMemo(
    () => [
      { value: "auto", label: t("generatePanel.qualityAuto") },
      { value: "low", label: t("generatePanel.qualityLow") },
      { value: "medium", label: t("generatePanel.qualityMedium") },
      { value: "high", label: t("generatePanel.qualityHigh") },
    ],
    [t],
  );

  const countOptions = useMemo(
    () =>
      [1, 2, 3, 4].map((n) => ({
        value: String(n),
        label: `×${n}`,
      })),
    [],
  );

  const comfyPresetId =
    COMFY_PRESETS.find(
      (item) =>
        item.workflow === String(params.workflow_json ?? "") ||
        item.type === String(params.type ?? ""),
    )?.id ?? COMFY_PRESETS[0].id;

  const comfyOptions = useMemo(
    () =>
      COMFY_PRESETS.map((item) => ({
        value: item.id,
        label: t(item.labelKey),
      })),
    [t],
  );

  return (
    <div className="p-4 border-b border-gray-200" data-testid="legacy-generate-panel">
      <h3 className="text-sm font-medium mb-1">{t("generatePanel.title")}</h3>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        {t("generatePanel.help")}
      </p>

      <div
        className="grid grid-cols-2 gap-1 p-1 mb-3 rounded-lg border border-gray-200 bg-gray-50"
        data-testid="legacy-engine-tabs"
      >
        {(["api", "comfy"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setEngine(tab)}
            className={cn(
              "py-1.5 text-xs rounded-md transition-colors font-medium",
              engine === tab
                ? "bg-black text-white"
                : "text-gray-600 hover:text-black",
            )}
            data-testid={`legacy-engine-tab-${tab}`}
          >
            {tab === "api"
              ? t("generatePanel.engineApi")
              : t("generatePanel.engineComfy")}
          </button>
        ))}
      </div>

      <textarea
        value={generate.prompt}
        onChange={(e) => setGenerate({ prompt: e.target.value })}
        placeholder={t("generatePanel.promptPlaceholder")}
        className="w-full h-24 border border-gray-200 rounded-lg bg-white p-2 text-sm mb-2 focus:border-black outline-none"
        data-testid="legacy-prompt"
      />

      {engine === "api" ? (
        <div className="space-y-2 mb-2" data-testid="legacy-api-options">
          <label className="block text-xs text-gray-600">
            {t("generatePanel.provider")}
            <StudioSelect
              value={providerId}
              onChange={(nextProvider) => {
                const nextModel = resolveImageModel(config, nextProvider, "");
                patchParams({
                  provider_id: nextProvider,
                  model: nextModel,
                });
              }}
              options={providerOptions}
              className="mt-1 w-full"
              data-testid="legacy-provider"
            />
          </label>
          <label className="block text-xs text-gray-600">
            {t("generatePanel.model")}
            <StudioSelect
              value={model}
              onChange={(nextModel) => patchParams({ model: nextModel })}
              options={modelOptions}
              className="mt-1 w-full"
              data-testid="legacy-model"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-600">
              {t("generatePanel.ratio")}
              <StudioSelect
                value={ratio}
                onChange={(nextRatio) =>
                  patchParams({
                    ratio: nextRatio,
                    size: resolveOnlineSize(
                      nextRatio as OnlineRatio,
                      resolution,
                    ),
                  })
                }
                options={ratioOptions}
                className="mt-1 w-full"
                data-testid="legacy-ratio"
              />
            </label>
            <label className="block text-xs text-gray-600">
              {t("generatePanel.resolution")}
              <StudioSelect
                value={resolution}
                onChange={(nextResolution) =>
                  patchParams({
                    resolution: nextResolution,
                    size: resolveOnlineSize(
                      ratio,
                      nextResolution as OnlineResolution,
                    ),
                  })
                }
                options={resolutionOptions}
                className="mt-1 w-full"
                data-testid="legacy-resolution"
              />
            </label>
          </div>
          <div className={cn("grid gap-2", showQuality ? "grid-cols-2" : "grid-cols-1")}>
            {showQuality ? (
              <label className="block text-xs text-gray-600">
                {t("generatePanel.quality")}
                <StudioSelect
                  value={quality}
                  onChange={(nextQuality) => patchParams({ quality: nextQuality })}
                  options={qualityOptions}
                  className="mt-1 w-full"
                  data-testid="legacy-quality"
                />
              </label>
            ) : null}
            <label className="block text-xs text-gray-600">
              {t("generatePanel.count")}
              <StudioSelect
                value={String(count)}
                onChange={(nextCount) =>
                  patchParams({ n: Number(nextCount) || 1 })
                }
                options={countOptions}
                className="mt-1 w-full"
                data-testid="legacy-count"
              />
            </label>
          </div>
          <p className="text-[10px] text-gray-400 font-mono" data-testid="legacy-size-label">
            {size}
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-2" data-testid="legacy-comfy-options">
          <label className="block text-xs text-gray-600">
            {t("generatePanel.comfyWorkflow")}
            <StudioSelect
              value={comfyPresetId}
              onChange={(presetId) => {
                const preset =
                  COMFY_PRESETS.find((item) => item.id === presetId) ??
                  COMFY_PRESETS[0];
                patchParams({
                  workflow_json: preset.workflow,
                  type: preset.type,
                });
              }}
              options={comfyOptions}
              className="mt-1 w-full"
              data-testid="legacy-comfy-workflow"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-600">
              {t("width")}
              <input
                type="number"
                min={256}
                max={8192}
                step={64}
                value={Number(params.width ?? 1024)}
                onChange={(e) =>
                  patchParams({ width: Number(e.target.value) || 1024 })
                }
                className="mt-1 w-full border border-gray-200 rounded-lg bg-white p-2 text-sm focus:border-black outline-none"
                data-testid="legacy-comfy-width"
              />
            </label>
            <label className="block text-xs text-gray-600">
              {t("height")}
              <input
                type="number"
                min={256}
                max={8192}
                step={64}
                value={Number(params.height ?? 1024)}
                onChange={(e) =>
                  patchParams({ height: Number(e.target.value) || 1024 })
                }
                className="mt-1 w-full border border-gray-200 rounded-lg bg-white p-2 text-sm focus:border-black outline-none"
                data-testid="legacy-comfy-height"
              />
            </label>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddNode}
          className="flex-1 flex items-center justify-center gap-1 py-2 border border-gray-200 rounded-lg hover:border-black text-sm"
          data-testid="legacy-add-node-btn"
        >
          <ImagePlus className="w-4 h-4" />
          {t("generatePanel.addNode")}
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={
            generating ||
            !generate.prompt.trim() ||
            (engine === "api" && (!providerId || !model))
          }
          className="flex-1 py-2 bg-black text-white text-sm rounded-lg disabled:opacity-50"
          data-testid="legacy-generate-btn"
        >
          {generating ? t("generating") : t("generate")}
        </button>
      </div>
      {generateError ? (
        <p
          className="mt-2 text-xs text-red-600"
          data-testid="legacy-generate-error"
          role="alert"
        >
          {generateError}
        </p>
      ) : null}
    </div>
  );
}
