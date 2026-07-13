import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, GitBranch, Loader2, Zap } from "lucide-react";
import { api } from "../../../shared/api/client";
import { LtxDirectorTimeline } from "./LtxDirectorTimeline";
import { ConnectedInputsSummary } from "./ConnectedInputsSummary";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import type { AiConfig } from "../../chat/types";
import {
  chatCapableProviders,
  imageCapableProviders,
  pickDefaultImageProvider,
  resolveChatModel,
  resolveImageModel,
  resolveVideoModel,
  videoCapableProviders,
} from "../../chat/providers";
import {
  ONLINE_RATIOS,
  ONLINE_RESOLUTIONS,
  resolveOnlineSize,
  type OnlineRatio,
  type OnlineResolution,
} from "../../tools/pages/onlineSize";
import { formatRunDuration } from "../core/generationLog";
import { generationKeyGateForNode } from "../core/generationKeyGate";
import {
  MS_GEN_MODEL_KEYS,
  MS_GEN_MODELS,
  MS_RATIO_OPTIONS,
  MS_RESOLUTION_OPTIONS,
  msUsesImages,
  resolveMsGenModelKey,
} from "../core/msGenModels";
import {
  currentMsModelId,
  modelscopeImageModels,
  modelscopeLorasForModel,
} from "../core/msLora";
import type { GeneratorSource } from "../core/nodeSources";
import {
  customRatioFromImageUrl,
  msSizeFromRatio,
  sizeFromCustomRatio,
} from "../core/sourceRatio";
import type { LegacyNode } from "../core/types";

const COMFY_PRESETS = [
  { id: "zimage", workflow: "z-image-t2i.json", type: "zimage", labelKey: "comfyText" },
  { id: "upscale", workflow: "upscale.json", type: "upscale", labelKey: "comfyEnhance" },
] as const;

const RUNNABLE_KINDS = new Set([
  "generator",
  "comfy",
  "video",
  "msgen",
  "llm",
  "rh",
  "ltxDirector",
]);

const MAX_IMAGE_COUNT = 8;

function clampImageCount(value: unknown): number {
  return Math.max(1, Math.min(MAX_IMAGE_COUNT, Number(value) || 1));
}

/** History-style ± stepper for multi-image generation count. */
function GenCountStepper({
  value,
  onChange,
  testId,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  testId: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("canvas");
  const count = clampImageCount(value);
  return (
    <div
      className="flex items-center gap-1"
      data-testid={testId}
      data-node-control=""
    >
      <span className="text-[10px] text-gray-500 shrink-0">
        {t("generatePanel.count")}
      </span>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden h-8">
        <button
          type="button"
          disabled={disabled || count <= 1}
          aria-label={t("decreaseCount")}
          className="px-1.5 h-full text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          data-testid={`${testId}-dec`}
          onClick={(e) => {
            e.stopPropagation();
            onChange(clampImageCount(count - 1));
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={disabled}
          value={String(count)}
          data-testid={`${testId}-input`}
          className="w-8 text-center text-xs outline-none tabular-nums bg-transparent"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange(clampImageCount(e.target.value))}
          onBlur={(e) => {
            e.currentTarget.value = String(clampImageCount(e.currentTarget.value));
          }}
        />
        <button
          type="button"
          disabled={disabled || count >= MAX_IMAGE_COUNT}
          aria-label={t("increaseCount")}
          className="px-1.5 h-full text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          data-testid={`${testId}-inc`}
          onClick={(e) => {
            e.stopPropagation();
            onChange(clampImageCount(count + 1));
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

interface GeneratorNodeBodyProps {
  node: LegacyNode;
  running: boolean;
  error?: string | null;
  showCascade?: boolean;
  /** Wired upstream sources (prompt/image) for in-node summary. */
  sources?: GeneratorSource[];
  /** History `llmInputText` — prompt text synced from wired Prompt/LLM/loop. */
  llmWiredInput?: string;
  /** History `llmInputImages` / `llmInputVideos` counts for the green badge. */
  llmWiredImageCount?: number;
  llmWiredVideoCount?: number;
  onUpdateSettings: (patch: Record<string, unknown>) => void;
  onUpdatePrompt: (prompt: string) => void;
  onRun: () => void;
  onCascade?: () => void;
}

export function isRunnableGeneratorKind(kind: string): boolean {
  return RUNNABLE_KINDS.has(kind);
}

/** Local textarea: primary when no wire; optional append when PROMPT→node is connected. */
function LocalPromptField({
  nodeId,
  value,
  fromWire,
  onChange,
  rowsClassName = "h-14",
}: {
  nodeId: string;
  value: string;
  fromWire: boolean;
  onChange: (next: string) => void;
  rowsClassName?: string;
}) {
  const { t } = useTranslation("canvas");
  return (
    <div data-testid={`legacy-gen-prompt-wrap-${nodeId}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {fromWire
          ? t("localPromptAppendLabel", { defaultValue: "附加提示词" })
          : t("localPromptLabel", { defaultValue: "提示词" })}
        {fromWire ? (
          <span className="ml-1 text-[9px] font-semibold normal-case tracking-normal text-gray-400 opacity-70">
            ({t("llmInputFromWire", { defaultValue: "来自连线" })} ·{" "}
            {t("localPromptAppendHint", {
              defaultValue: "可选，拼在连线提示词后",
            })}
            )
          </span>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={
          fromWire
            ? t("localPromptAppendPlaceholder", {
                defaultValue: "可选：附加提示词…",
              })
            : t("generatePanel.promptPlaceholder")
        }
        className={`w-full ${rowsClassName} border border-gray-200 rounded-lg p-2 text-xs focus:border-black outline-none resize-none`}
        data-testid={`legacy-gen-prompt-${nodeId}`}
        data-from-wire={fromWire ? "1" : "0"}
      />
    </div>
  );
}

function ratioOptionLabel(
  item: (typeof ONLINE_RATIOS)[number],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (item.id === "source") {
    return t("adaptiveRatio", { defaultValue: "适配比例" });
  }
  return t(item.labelKey, { ns: "studio", defaultValue: item.id });
}

export function GeneratorNodeBody({
  node,
  running,
  error,
  showCascade = false,
  sources = [],
  llmWiredInput = "",
  llmWiredImageCount = 0,
  llmWiredVideoCount = 0,
  onUpdateSettings,
  onUpdatePrompt,
  onRun,
  onCascade,
}: GeneratorNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const [, tick] = useState(0);
  const runAnchorRef = useRef<number | null>(null);
  const settings = node.settings ?? {};
  const imageCount = clampImageCount(settings.count);
  const wiredPromptText = sources
    .map((s) => s.prompt)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const promptFromWire = wiredPromptText.length > 0;

  useEffect(() => {
    if (!running) {
      runAnchorRef.current = null;
      return;
    }
    const stamped = Number(settings.runStartedAt);
    const now = Date.now();
    // Prefer a freshly stamped epoch; ignore stale anchors from a prior run
    // so the button never opens at e.g. 10.0s.
    if (Number.isFinite(stamped) && stamped > 1e12 && now - stamped < 2000) {
      runAnchorRef.current = stamped;
    } else if (runAnchorRef.current == null) {
      runAnchorRef.current = now;
    }
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [running, settings.runStartedAt]);

  const runElapsed = (() => {
    if (!running) return "";
    const now = Date.now();
    const stamped = Number(settings.runStartedAt);
    const stampedFresh =
      Number.isFinite(stamped) && stamped > 1e12 && now - stamped < 2000;
    // Sync init on first running paint — do not fall back to a stale settings stamp.
    if (runAnchorRef.current == null) {
      runAnchorRef.current = stampedFresh ? stamped : now;
    } else if (stampedFresh) {
      runAnchorRef.current = stamped;
    }
    return formatRunDuration(Math.max(0, now - runAnchorRef.current));
  })();

  const { data: config } = useQuery({
    queryKey: ["legacy-canvas-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const imageProviders = useMemo(
    () => imageCapableProviders(config),
    [config],
  );
  const videoProviders = useMemo(
    () => videoCapableProviders(config),
    [config],
  );
  const chatProviders = useMemo(
    () => chatCapableProviders(config),
    [config],
  );

  const providerId = String(settings.apiProvider ?? settings.provider_id ?? "");
  const model = String(settings.model ?? "");
  const ratio = String(settings.ratio ?? "square") as OnlineRatio;
  const resolution = String(settings.resolution ?? "1k") as OnlineResolution;
  const customRatio = String(settings.customRatio ?? "");

  const firstImageUrl = useMemo(() => {
    for (const src of sources) {
      const url = src.refs.find((r) => r.url)?.url;
      if (url) return url;
    }
    return "";
  }, [sources]);

  const imageModels = useMemo(() => {
    const provider = imageProviders.find((p) => p.id === providerId);
    return provider?.image_models?.length
      ? provider.image_models
      : config?.image_models ?? [];
  }, [imageProviders, providerId, config]);

  const videoModels = useMemo(() => {
    const provider = videoProviders.find((p) => p.id === providerId);
    return (
      (provider as { video_models?: string[] } | undefined)?.video_models ??
      config?.video_models ??
      []
    );
  }, [videoProviders, providerId, config]);

  const patch = (next: Record<string, unknown>) =>
    onUpdateSettings({ ...settings, ...next });

  const keyGate = useMemo(
    () => generationKeyGateForNode(node, config),
    [node, config],
  );
  const configBlocked = Boolean(config) && !keyGate.ready;

  useEffect(() => {
    if (!config) return;
    if (node.kind === "generator") {
      const nextProvider =
        providerId || pickDefaultImageProvider(config, "");
      const nextModel =
        model || resolveImageModel(config, nextProvider, "");
      if (
        nextProvider &&
        (nextProvider !== providerId || (nextModel && nextModel !== model))
      ) {
        patch({
          apiProvider: nextProvider,
          model: nextModel || model,
          provider_id: nextProvider,
        });
      }
      return;
    }
    if (node.kind === "video") {
      const nextProvider = providerId || videoProviders[0]?.id || "";
      const nextModel =
        model || resolveVideoModel(config, nextProvider, "");
      if (
        nextProvider &&
        (nextProvider !== providerId || (nextModel && nextModel !== model))
      ) {
        patch({
          apiProvider: nextProvider,
          model: nextModel || model,
          provider_id: nextProvider,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when config/providers resolve
  }, [config, node.kind, providerId, model, videoProviders]);

  useEffect(() => {
    if (node.kind !== "generator" && node.kind !== "msgen") return;
    if (ratio !== "source" || !firstImageUrl) return;
    let cancelled = false;
    void (async () => {
      const derived = await customRatioFromImageUrl(firstImageUrl);
      if (cancelled || !derived) return;
      if (derived === customRatio) return;
      const size =
        sizeFromCustomRatio(derived, resolution) ||
        resolveOnlineSize("square", resolution);
      if (node.kind === "msgen") {
        const dims = msSizeFromRatio(derived, resolution);
        patch({
          customRatio: derived,
          ...(dims ? { msWidth: dims.width, msHeight: dims.height } : {}),
        });
        return;
      }
      patch({ customRatio: derived, size });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from first image only
  }, [ratio, firstImageUrl, resolution, node.kind]);

  const configGateBanner = configBlocked ? (
    <div
      className="rounded-none border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold leading-snug text-amber-900"
      role="status"
      data-testid={`legacy-config-gate-${node.id}`}
    >
      <p>
        {t(keyGate.messageKey, { defaultValue: keyGate.messageFallback })}
      </p>
      <Link
        to={keyGate.settingsPath}
        className="mt-1 inline-block text-[11px] font-extrabold text-amber-950 underline underline-offset-2"
        data-testid={`legacy-config-gate-link-${node.id}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {t("openApiSettings", { defaultValue: "打开 API 设置" })}
      </Link>
    </div>
  ) : null;

  const runButton = (label: string, testId: string) => (
    <>
      <button
        type="button"
        disabled={running || configBlocked}
        onClick={(e) => {
          e.stopPropagation();
          if (configBlocked) return;
          onRun();
        }}
        className={
          running
            ? "w-full flex items-center justify-center gap-1.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg ring-2 ring-blue-400/50 disabled:opacity-90"
            : "w-full flex items-center justify-center gap-1.5 py-1.5 bg-black text-white text-xs rounded-lg hover:bg-gray-900 disabled:opacity-50"
        }
        data-testid={testId}
        aria-busy={running}
        aria-disabled={configBlocked || undefined}
      >
        {running ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-300" aria-hidden />
        ) : (
          <Zap className="w-3.5 h-3.5" />
        )}
        <span className="tabular-nums">
          {running
            ? `${t("generating")}${runElapsed ? ` ${runElapsed}` : ""}`
            : label}
        </span>
      </button>
      {showCascade && onCascade ? (
        <button
          type="button"
          disabled={running || configBlocked}
          onClick={(e) => {
            e.stopPropagation();
            if (configBlocked) return;
            onCascade();
          }}
          className="w-full flex items-center justify-center gap-1 py-1.5 border border-gray-200 text-xs rounded-lg hover:border-black disabled:opacity-50"
          data-testid={`legacy-cascade-${node.id}`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          {t("cascadeRun")}
        </button>
      ) : null}
      {error ? (
        <p className="text-[10px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  const bodyShell = (testId: string, children: ReactNode) => (
    <div
      className={
        configBlocked
          ? "px-2 pb-2 space-y-1.5 opacity-55 grayscale-[0.35]"
          : "px-2 pb-2 space-y-1.5"
      }
      data-node-control=""
      data-testid={testId}
      data-config-blocked={configBlocked ? "1" : "0"}
    >
      {configGateBanner}
      {children}
    </div>
  );

  const inputsSummary = (
    <ConnectedInputsSummary
      sources={sources}
      nodeId={node.id}
      showEmptyImagesHint={
        node.kind === "generator" ||
        node.kind === "comfy" ||
        node.kind === "msgen" ||
        node.kind === "video" ||
        node.kind === "rh"
      }
    />
  );

  if (node.kind === "generator") {
    return bodyShell(
      `legacy-gen-body-${node.id}`,
      <>
        {inputsSummary}
        <LocalPromptField
          nodeId={node.id}
          value={node.prompt}
          fromWire={promptFromWire}
          onChange={onUpdatePrompt}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <StudioSelect
            value={providerId}
            onChange={(next) =>
              patch({
                apiProvider: next,
                provider_id: next,
                model: resolveImageModel(config, next, ""),
              })
            }
            options={imageProviders.map((p) => ({
              value: p.id,
              label: p.name || p.id,
            }))}
            placeholder={t("selectProvider", { defaultValue: "供应商" })}
            className="w-full text-xs"
            data-testid={`legacy-gen-provider-${node.id}`}
          />
          <StudioSelect
            value={model}
            onChange={(next) => patch({ model: next })}
            options={imageModels.map((m) => ({ value: m, label: m }))}
            placeholder={t("selectModel", { defaultValue: "模型" })}
            className="w-full text-xs"
            data-testid={`legacy-gen-model-${node.id}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <StudioSelect
            value={ratio}
            onChange={(next) => {
              const nextRatio = next as OnlineRatio;
              if (nextRatio === "source") {
                patch({
                  ratio: nextRatio,
                  customRatio: "",
                  size: resolveOnlineSize("square", resolution),
                });
                return;
              }
              patch({
                ratio: nextRatio,
                customRatio: "",
                size: resolveOnlineSize(nextRatio, resolution),
              });
            }}
            options={ONLINE_RATIOS.map((item) => ({
              value: item.id,
              label: ratioOptionLabel(item, t),
            }))}
            className="w-full text-xs"
            data-testid={`legacy-gen-ratio-${node.id}`}
          />
          <StudioSelect
            value={resolution}
            onChange={(next) => {
              const res = next as OnlineResolution;
              if (ratio === "source" && customRatio) {
                patch({
                  resolution: res,
                  size:
                    sizeFromCustomRatio(customRatio, res) ||
                    resolveOnlineSize("square", res),
                });
                return;
              }
              patch({
                resolution: res,
                size: resolveOnlineSize(
                  ratio === "source" ? "square" : ratio,
                  res,
                ),
              });
            }}
            options={ONLINE_RESOLUTIONS.map((item) => ({
              value: item,
              label: item.toUpperCase(),
            }))}
            className="w-full text-xs"
            data-testid={`legacy-gen-resolution-${node.id}`}
          />
        </div>
        <GenCountStepper
          value={imageCount}
          disabled={running || configBlocked}
          testId={`legacy-gen-count-${node.id}`}
          onChange={(count) => patch({ count })}
        />
        {ratio === "source" ? (
          <p
            className="text-[10px] text-gray-500"
            data-testid={`legacy-gen-source-ratio-${node.id}`}
          >
            {t("adaptiveRatio")}:{" "}
            {customRatio || (firstImageUrl ? "…" : t("needImage"))}
          </p>
        ) : null}
        {runButton(t("apiGenerate"), `legacy-gen-run-${node.id}`)}
      </>,
    );
  }

  if (node.kind === "comfy") {
    const presetId =
      COMFY_PRESETS.find(
        (p) =>
          p.workflow === String(settings.workflow_json ?? "") ||
          p.type === String(settings.type ?? ""),
      )?.id ?? COMFY_PRESETS[0].id;

    return bodyShell(
      `legacy-comfy-body-${node.id}`,
      <>
        {inputsSummary}
        <LocalPromptField
          nodeId={node.id}
          value={node.prompt}
          fromWire={promptFromWire}
          onChange={onUpdatePrompt}
          rowsClassName="h-16"
        />
        <StudioSelect
          value={presetId}
          onChange={(id) => {
            const preset =
              COMFY_PRESETS.find((p) => p.id === id) ?? COMFY_PRESETS[0];
            patch({ workflow_json: preset.workflow, type: preset.type });
          }}
          options={COMFY_PRESETS.map((p) => ({
            value: p.id,
            label: t(p.labelKey),
          }))}
          className="w-full text-xs"
        />
        {runButton("ComfyUI", `legacy-comfy-run-${node.id}`)}
      </>,
    );
  }

  if (node.kind === "video") {
    return bodyShell(
      `legacy-video-body-${node.id}`,
      <>
        {inputsSummary}
        <LocalPromptField
          nodeId={node.id}
          value={node.prompt}
          fromWire={promptFromWire}
          onChange={onUpdatePrompt}
          rowsClassName="h-16"
        />
        <div className="grid grid-cols-2 gap-1">
          <StudioSelect
            value={providerId}
            onChange={(next) =>
              patch({
                apiProvider: next,
                provider_id: next,
                model: resolveVideoModel(config, next, ""),
              })
            }
            options={videoProviders.map((p) => ({
              value: p.id,
              label: p.name || p.id,
            }))}
            className="w-full text-xs"
          />
          <StudioSelect
            value={model}
            onChange={(next) => patch({ model: next })}
            options={videoModels.map((m) => ({ value: m, label: m }))}
            className="w-full text-xs"
          />
        </div>
        {!videoProviders.length ? (
          <p className="text-[10px] text-amber-700" role="status">
            {t("noVideoProviders", {
              defaultValue: "暂无视频 API 平台，请到 API 设置添加",
            })}
          </p>
        ) : null}
        {runButton(t("videoGenerate"), `legacy-video-run-${node.id}`)}
      </>,
    );
  }

  if (node.kind === "msgen") {
    const modelKey = resolveMsGenModelKey(settings.msgenModel);
    const usesImages = msUsesImages(modelKey);
    const msRatio = String(settings.msRatio ?? settings.ratio ?? "square");
    const msResolution = String(
      settings.msResolution ?? settings.resolution ?? "1k",
    );
    const msModelId = currentMsModelId(modelKey, settings, config);
    const msLoras = modelscopeLorasForModel(config, msModelId);
    const selectedLora =
      msLoras.find(
        (lora) => lora.id === String(settings.msLoraId ?? "").trim(),
      ) ?? msLoras[0];
    const loraEnabled = Boolean(settings.msLoraEnabled);
    const loraStrength = Number(
      settings.msLoraStrength ?? selectedLora?.strength ?? 0.8,
    );
    const customModels = modelscopeImageModels(
      config,
      String(settings.msCustomModel ?? ""),
    );

    return bodyShell(
      `legacy-msgen-body-${node.id}`,
      <>
        <div
          className="legacy-ms-model-tabs grid grid-cols-4 gap-1 border border-gray-200 bg-gray-50 p-1"
          data-testid={`legacy-msgen-tabs-${node.id}`}
        >
          {MS_GEN_MODEL_KEYS.map((key) => {
            const def = MS_GEN_MODELS[key];
            const active = modelKey === key;
            const label = def.labelKey
              ? t(def.labelKey, { defaultValue: def.label })
              : def.label;
            return (
              <button
                key={key}
                type="button"
                disabled={configBlocked}
                className={
                  active
                    ? "h-8 truncate bg-[var(--settings-accent,#111827)] px-1 text-[10px] font-extrabold text-white"
                    : "h-8 truncate px-1 text-[10px] font-extrabold text-gray-500 hover:bg-white"
                }
                data-testid={`legacy-msgen-tab-${key}-${node.id}`}
                data-active={active ? "1" : "0"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (key === modelKey) return;
                  patch({
                    msgenModel: key,
                    msLoraId: "",
                    msLoraEnabled: false,
                    msLoraStrength: undefined,
                  });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {label}
              </button>
            );
          })}
        </div>
        <ConnectedInputsSummary
          sources={sources}
          nodeId={node.id}
          showImagesSection={usesImages}
          showEmptyImagesHint={usesImages}
          emptyImagesDashed={usesImages}
        />
        <LocalPromptField
          nodeId={node.id}
          value={node.prompt}
          fromWire={promptFromWire}
          onChange={onUpdatePrompt}
          rowsClassName="h-10"
        />
        <div className="space-y-1.5 border border-gray-200 p-1.5">
          {modelKey === "custom" ? (
            <StudioSelect
              value={String(settings.msCustomModel ?? customModels[0] ?? "")}
              onChange={(next) =>
                patch({
                  msCustomModel: next,
                  msLoraId: "",
                  msLoraEnabled: false,
                  msLoraStrength: undefined,
                })
              }
              options={customModels.map((m) => ({ value: m, label: m }))}
              className="w-full text-xs"
              data-testid={`legacy-msgen-custom-model-${node.id}`}
            />
          ) : null}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
            <StudioSelect
              value={msResolution}
              onChange={(next) => {
                const dims = msSizeFromRatio(
                  MS_RATIO_OPTIONS.find((r) => r.id === msRatio)?.label || "1:1",
                  next,
                );
                patch({
                  msResolution: next,
                  resolution: next,
                  ...(dims
                    ? { msWidth: dims.width, msHeight: dims.height }
                    : {}),
                });
              }}
              options={MS_RESOLUTION_OPTIONS.map((item) => ({
                value: item,
                label: item.toUpperCase(),
              }))}
              className="w-full text-xs"
              data-testid={`legacy-msgen-resolution-${node.id}`}
            />
            <StudioSelect
              value={
                MS_RATIO_OPTIONS.some((r) => r.id === msRatio)
                  ? msRatio
                  : "square"
              }
              onChange={(next) => {
                const label =
                  MS_RATIO_OPTIONS.find((r) => r.id === next)?.label || "1:1";
                const dims = msSizeFromRatio(label, msResolution);
                patch({
                  msRatio: next,
                  ratio: next,
                  ...(dims
                    ? { msWidth: dims.width, msHeight: dims.height }
                    : {}),
                });
              }}
              options={MS_RATIO_OPTIONS.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              className="w-full text-xs"
              data-testid={`legacy-msgen-ratio-${node.id}`}
            />
            <GenCountStepper
              value={imageCount}
              disabled={running || configBlocked}
              testId={`legacy-msgen-count-${node.id}`}
              onChange={(count) => patch({ count })}
            />
          </div>
          {msLoras.length ? (
            <>
              <label
                className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
                data-testid={`legacy-msgen-lora-enable-${node.id}`}
              >
                <input
                  type="checkbox"
                  checked={loraEnabled}
                  disabled={configBlocked}
                  onChange={(e) =>
                    patch({
                      msLoraEnabled: e.target.checked,
                      msLoraId:
                        e.target.checked && selectedLora
                          ? selectedLora.id
                          : settings.msLoraId,
                    })
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                />
                <span>{t("enableLora")}</span>
              </label>
              {loraEnabled ? (
                <>
                  <StudioSelect
                    value={selectedLora?.id ?? ""}
                    onChange={(next) => {
                      const picked =
                        msLoras.find((l) => l.id === next) ?? msLoras[0];
                      patch({
                        msLoraId: next,
                        msLoraStrength:
                          settings.msLoraStrength ?? picked?.strength ?? 0.8,
                      });
                    }}
                    options={msLoras.map((l) => ({
                      value: l.id,
                      label: l.name || l.id,
                    }))}
                    className="w-full text-xs"
                    data-testid={`legacy-msgen-lora-select-${node.id}`}
                  />
                  <label className="block text-[10px] font-bold text-gray-500">
                    <span className="mb-0.5 flex justify-between">
                      <span>{t("loraStrength")}</span>
                      <span className="tabular-nums">
                        {loraStrength.toFixed(2)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={loraStrength}
                      disabled={configBlocked}
                      className="w-full"
                      data-testid={`legacy-msgen-lora-strength-${node.id}`}
                      onChange={(e) =>
                        patch({ msLoraStrength: Number(e.target.value) })
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : (
            <p
              className="text-[11px] font-bold leading-snug text-slate-400"
              data-testid={`legacy-msgen-lora-hint-${node.id}`}
            >
              {t("noLoraForModel")}
            </p>
          )}
        </div>
        {runButton(t("msGenerate"), `legacy-msgen-run-${node.id}`)}
      </>,
    );
  }

  if (node.kind === "llm") {
    const llmProvider = String(settings.llmProvider ?? "");
    const provider = chatProviders.find((p) => p.id === llmProvider);
    const llmModels =
      llmProvider === "modelscope"
        ? config?.ms_chat_models ?? []
        : provider?.chat_models?.length
          ? provider.chat_models
          : config?.chat_models ?? [];
    const fromWire = llmWiredInput.trim().length > 0;
    const manualInput = String(settings.userInput ?? node.prompt ?? "");
    const inputValue = fromWire ? llmWiredInput : manualInput;
    const mediaParts = [
      llmWiredImageCount > 0
        ? t("llmConnectedImages", {
            count: llmWiredImageCount,
            defaultValue: `${llmWiredImageCount} 张图片`,
          })
        : "",
      llmWiredVideoCount > 0
        ? t("llmConnectedVideos", {
            count: llmWiredVideoCount,
            defaultValue: `${llmWiredVideoCount} 个视频`,
          })
        : "",
    ].filter(Boolean);
    const mediaBadge = mediaParts.length
      ? t("llmConnectedMediaHint", {
          summary: mediaParts.join(" · "),
          defaultValue: `已连接 ${mediaParts.join(" · ")}，需选择支持视觉/视频的模型`,
        })
      : "";

    return bodyShell(
      `legacy-llm-body-${node.id}`,
      <>
        <div className="grid grid-cols-2 gap-1">
          <StudioSelect
            value={llmProvider}
            onChange={(next) =>
              patch({
                llmProvider: next,
                model: resolveChatModel(config, next, {}, ""),
              })
            }
            options={chatProviders.map((p) => ({
              value: p.id,
              label: p.name || p.id,
            }))}
            className="w-full text-xs"
          />
          <StudioSelect
            value={String(settings.model ?? "")}
            onChange={(next) => patch({ model: next })}
            options={llmModels.map((m) => ({ value: m, label: m }))}
            className="w-full text-xs"
          />
        </div>
        {mediaBadge ? (
          <div
            className="inline-flex max-w-full items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold leading-snug text-emerald-700"
            data-testid={`legacy-llm-media-badge-${node.id}`}
          >
            {mediaBadge}
          </div>
        ) : null}
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Input
            {fromWire ? (
              <span className="ml-1 text-[9px] font-semibold normal-case tracking-normal text-gray-400 opacity-70">
                ({t("llmInputFromWire", { defaultValue: "来自连线" })})
              </span>
            ) : null}
          </div>
          <textarea
            value={inputValue}
            readOnly={fromWire}
            onChange={(e) => {
              if (fromWire) return;
              patch({ userInput: e.target.value });
              onUpdatePrompt(e.target.value);
            }}
            placeholder={t("llmInputEmpty")}
            className={
              fromWire
                ? "w-full min-h-[70px] resize-none border border-gray-200 bg-[#f8fafc] p-2 text-xs text-slate-600 cursor-default outline-none"
                : "w-full min-h-[70px] resize-none border border-gray-200 bg-[#fbfdff] p-2 text-xs outline-none focus:border-[var(--text)]"
            }
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`legacy-llm-input-${node.id}`}
            data-from-wire={fromWire ? "1" : "0"}
          />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Output
          </div>
          <textarea
            value={String(settings.outputText ?? "")}
            readOnly
            placeholder={t("llmOutputEmpty")}
            className="w-full min-h-[70px] resize-none border border-gray-200 bg-gray-50 p-2 text-xs outline-none"
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`legacy-llm-output-${node.id}`}
          />
        </div>
        {runButton(t("llmNode"), `legacy-llm-run-${node.id}`)}
      </>,
    );
  }

  if (node.kind === "rh") {
    const rhMode = String(settings.rhMode ?? "workflow");
    return bodyShell(
      `legacy-rh-body-${node.id}`,
      <>
        {inputsSummary}
        <StudioSelect
          value={rhMode}
          onChange={(next) => patch({ rhMode: next })}
          options={[
            { value: "workflow", label: "Workflow" },
            { value: "app", label: "App" },
          ]}
          className="w-full text-xs"
        />
        {rhMode === "workflow" ? (
          <input
            value={String(settings.workflowId ?? "")}
            onChange={(e) => patch({ workflowId: e.target.value })}
            placeholder={t("rhNeedWorkflowId")}
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <input
            value={String(settings.webappId ?? "")}
            onChange={(e) => patch({ webappId: e.target.value })}
            placeholder={t("rhNeedWebappId")}
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
        <p className="text-[10px] text-gray-500">
          {t("rhNodeInfoHint", {
            defaultValue:
              "运行时自动拉取参数，并将连线提示词和图片映射到对应字段",
          })}
        </p>
        <GenCountStepper
          value={imageCount}
          disabled={running || configBlocked}
          testId={`legacy-rh-count-${node.id}`}
          onChange={(count) => patch({ count })}
        />
        {runButton("RunningHub", `legacy-rh-run-${node.id}`)}
      </>,
    );
  }

  if (node.kind === "ltxDirector") {
    const ltxWorkflow = String(settings.workflow_json ?? "LTXDirectorv2-API.json");
    return bodyShell(
      `legacy-ltx-body-${node.id}`,
      <>
        {inputsSummary}
        <div>
          <input
            value={ltxWorkflow}
            onChange={(e) => patch({ workflow_json: e.target.value })}
            placeholder="LTX Director 工作流 JSON"
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`legacy-ltx-workflow-${node.id}`}
          />
          <p className="mt-1 text-[10px] text-gray-500">
            运行前会检查工作流文件、节点和模型是否可用。
          </p>
        </div>
        <LtxDirectorTimeline
          node={node}
          onUpdateSettings={(p) => onUpdateSettings({ ...settings, ...p })}
        />
        {runButton(t("ltxRun"), `legacy-ltx-run-${node.id}`)}
      </>,
    );
  }

  return null;
}
