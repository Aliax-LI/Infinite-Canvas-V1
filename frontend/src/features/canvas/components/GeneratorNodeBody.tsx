import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch, Loader2, Zap } from "lucide-react";
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
import { runElapsedMs } from "../core/runState";
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

interface GeneratorNodeBodyProps {
  node: LegacyNode;
  running: boolean;
  error?: string | null;
  showCascade?: boolean;
  /** Wired upstream sources (prompt/image) for in-node summary. */
  sources?: GeneratorSource[];
  onUpdateSettings: (patch: Record<string, unknown>) => void;
  onUpdatePrompt: (prompt: string) => void;
  onRun: () => void;
  onCascade?: () => void;
}

export function isRunnableGeneratorKind(kind: string): boolean {
  return RUNNABLE_KINDS.has(kind);
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
  onUpdateSettings,
  onUpdatePrompt,
  onRun,
  onCascade,
}: GeneratorNodeBodyProps) {
  const { t } = useTranslation("canvas");
  const [, tick] = useState(0);
  const settings = node.settings ?? {};

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const runElapsed =
    running && settings.runStartedAt != null
      ? formatRunDuration(runElapsedMs(settings, running))
      : running
        ? formatRunDuration(0)
        : "";

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

  const runButton = (label: string, testId: string) => (
    <>
      <button
        type="button"
        disabled={running}
        onClick={(e) => {
          e.stopPropagation();
          onRun();
        }}
        className={
          running
            ? "w-full flex items-center justify-center gap-1.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg ring-2 ring-blue-400/50 disabled:opacity-90"
            : "w-full flex items-center justify-center gap-1.5 py-1.5 bg-black text-white text-xs rounded-lg hover:bg-gray-900 disabled:opacity-50"
        }
        data-testid={testId}
        aria-busy={running}
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
          disabled={running}
          onClick={(e) => {
            e.stopPropagation();
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
    return (
      <div
        className="px-2 pb-2 space-y-1.5"
        data-node-control=""
        data-testid={`legacy-gen-body-${node.id}`}
      >
        {inputsSummary}
        <textarea
          value={node.prompt}
          onChange={(e) => onUpdatePrompt(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("generatePanel.promptPlaceholder")}
          className="w-full h-14 border border-gray-200 rounded-lg p-2 text-xs focus:border-black outline-none resize-none"
          data-testid={`legacy-gen-prompt-${node.id}`}
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
      </div>
    );
  }

  if (node.kind === "comfy") {
    const presetId =
      COMFY_PRESETS.find(
        (p) =>
          p.workflow === String(settings.workflow_json ?? "") ||
          p.type === String(settings.type ?? ""),
      )?.id ?? COMFY_PRESETS[0].id;

    return (
      <div
        className="px-2 pb-2 space-y-2"
        data-node-control=""
        data-testid={`legacy-comfy-body-${node.id}`}
      >
        {inputsSummary}
        <textarea
          value={node.prompt}
          onChange={(e) => onUpdatePrompt(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("generatePanel.promptPlaceholder")}
          className="w-full h-16 border border-gray-200 rounded-lg p-2 text-xs focus:border-black outline-none resize-none"
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
      </div>
    );
  }

  if (node.kind === "video") {
    return (
      <div
        className="px-2 pb-2 space-y-2"
        data-node-control=""
        data-testid={`legacy-video-body-${node.id}`}
      >
        {inputsSummary}
        <textarea
          value={node.prompt}
          onChange={(e) => onUpdatePrompt(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("generatePanel.promptPlaceholder")}
          className="w-full h-16 border border-gray-200 rounded-lg p-2 text-xs focus:border-black outline-none resize-none"
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
      </div>
    );
  }

  if (node.kind === "msgen") {
    const msRatio = String(settings.ratio ?? "square") as OnlineRatio;
    return (
      <div
        className="px-2 pb-2 space-y-2"
        data-node-control=""
        data-testid={`legacy-msgen-body-${node.id}`}
      >
        {inputsSummary}
        <textarea
          value={node.prompt}
          onChange={(e) => onUpdatePrompt(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("generatePanel.promptPlaceholder")}
          className="w-full h-16 border border-gray-200 rounded-lg p-2 text-xs focus:border-black outline-none resize-none"
        />
        <StudioSelect
          value={msRatio}
          onChange={(next) => {
            const nextRatio = next as OnlineRatio;
            if (nextRatio === "source") {
              patch({ ratio: nextRatio, customRatio: "" });
              return;
            }
            const presetColon: Record<string, string> = {
              square: "1:1",
              story: "9:16",
              wide: "16:9",
              portrait: "2:3",
              landscape: "3:2",
              portrait43: "3:4",
              landscape43: "4:3",
            };
            const dims = msSizeFromRatio(
              presetColon[nextRatio] || "1:1",
              "1k",
            );
            patch({
              ratio: nextRatio,
              customRatio: "",
              ...(dims
                ? { msWidth: dims.width, msHeight: dims.height }
                : {}),
            });
          }}
          options={ONLINE_RATIOS.map((item) => ({
            value: item.id,
            label: ratioOptionLabel(item, t),
          }))}
          className="w-full text-xs"
          data-testid={`legacy-msgen-ratio-${node.id}`}
        />
        <div className="grid grid-cols-2 gap-1 text-xs">
          <label className="flex flex-col gap-0.5">
            W
            <input
              type="number"
              value={Number(settings.msWidth ?? 1024)}
              onChange={(e) =>
                patch({ msWidth: Number(e.target.value), ratio: "square" })
              }
              className="border border-gray-200 rounded-lg px-2 py-1"
              onPointerDown={(e) => e.stopPropagation()}
              disabled={msRatio === "source"}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            H
            <input
              type="number"
              value={Number(settings.msHeight ?? 1024)}
              onChange={(e) =>
                patch({ msHeight: Number(e.target.value), ratio: "square" })
              }
              className="border border-gray-200 rounded-lg px-2 py-1"
              onPointerDown={(e) => e.stopPropagation()}
              disabled={msRatio === "source"}
            />
          </label>
        </div>
        {msRatio === "source" ? (
          <p className="text-[10px] text-gray-500">
            {t("adaptiveRatio")}:{" "}
            {customRatio || (firstImageUrl ? "…" : t("needImage"))}
          </p>
        ) : null}
        {runButton("ModelScope", `legacy-msgen-run-${node.id}`)}
      </div>
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

    return (
      <div
        className="px-2 pb-2 space-y-2"
        data-node-control=""
        data-testid={`legacy-llm-body-${node.id}`}
      >
        <ConnectedInputsSummary
          sources={sources}
          nodeId={node.id}
          showEmptyImagesHint={false}
        />
        <textarea
          value={String(settings.outputText ?? "")}
          readOnly
          placeholder={t("llmOutputEmpty")}
          className="w-full h-14 border border-gray-200 rounded-lg p-2 text-xs bg-gray-50 resize-none"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`legacy-llm-output-${node.id}`}
        />
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
        {runButton(t("llmNode"), `legacy-llm-run-${node.id}`)}
      </div>
    );
  }

  if (node.kind === "rh") {
    const rhMode = String(settings.rhMode ?? "workflow");
    return (
      <div
        className="px-2 pb-2 space-y-2"
        data-node-control=""
        data-testid={`legacy-rh-body-${node.id}`}
      >
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
        {runButton("RunningHub", `legacy-rh-run-${node.id}`)}
      </div>
    );
  }

  if (node.kind === "ltxDirector") {
    const ltxWorkflow = String(settings.workflow_json ?? "LTXDirectorv2-API.json");
    return (
      <div className="px-0 pb-2" data-testid={`legacy-ltx-body-${node.id}`}>
        <div className="px-2">{inputsSummary}</div>
        <div className="px-2 pb-2">
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
        <div className="px-2">
          {runButton(t("ltxRun"), `legacy-ltx-run-${node.id}`)}
        </div>
      </div>
    );
  }

  return null;
}
