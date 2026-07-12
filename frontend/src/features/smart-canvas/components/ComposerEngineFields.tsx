import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import type { AiConfig } from "../../chat/types";
import {
  imageCapableProviders,
  pickDefaultImageProvider,
  resolveImageModel,
  resolveVideoModel,
  videoCapableProviders,
} from "../../chat/providers";
import type { ComposerSettings, EngineKind } from "../core/types";
import { StudioSelect } from "../../../shared/ui/StudioSelect";

export interface ParamField {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface ComposerEngineFieldsProps {
  engine: EngineKind;
  kind: ComposerSettings["kind"];
  params: Record<string, unknown>;
  paramFields: ParamField[];
  onChange: (params: Record<string, unknown>) => void;
}

const COMFY_MODES = ["text", "enhance", "edit", "custom"] as const;

const fieldClass =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-serif focus:border-black focus:outline-none transition-colors";

export function ComposerEngineFields({
  engine,
  kind,
  params,
  paramFields,
  onChange,
}: ComposerEngineFieldsProps) {
  const patch = (key: string, value: unknown) =>
    onChange({ ...params, [key]: value });

  const { data: config } = useQuery({
    queryKey: ["smart-canvas-config"],
    queryFn: () => api.get<AiConfig>("/api/config"),
  });

  const imageProviders = useMemo(() => imageCapableProviders(config), [config]);
  const videoProviders = useMemo(() => videoCapableProviders(config), [config]);
  const providers = kind === "video" ? videoProviders : imageProviders;
  const providerId = String(params.provider_id ?? params.provider ?? "");
  const model = String(params.model ?? "");

  const models = useMemo(() => {
    const provider = providers.find((p) => p.id === providerId);
    if (kind === "video") {
      return (
        (provider as { video_models?: string[] } | undefined)?.video_models ??
        config?.video_models ??
        []
      );
    }
    return provider?.image_models?.length
      ? provider.image_models
      : config?.image_models ?? [];
  }, [providers, providerId, kind, config]);

  // Seed defaults from /api/config so Generate is not a silent empty-model failure.
  useEffect(() => {
    if (!config) return;
    if (engine !== "api" && engine !== "openai" && engine !== "volcengine") return;
    if (kind === "text") return;
    const nextProvider =
      providerId ||
      (kind === "video"
        ? videoProviders[0]?.id || ""
        : pickDefaultImageProvider(config, ""));
    const nextModel =
      model ||
      (kind === "video"
        ? resolveVideoModel(config, nextProvider, "")
        : resolveImageModel(config, nextProvider, ""));
    if (
      nextProvider &&
      (nextProvider !== providerId || (nextModel && nextModel !== model))
    ) {
      onChange({
        ...params,
        provider_id: nextProvider,
        provider: nextProvider,
        model: nextModel || model,
      });
    }
    // Only re-seed when engine/kind/config identity changes — not on every params edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, engine, kind]);

  if (engine === "comfy") {
    const mode = String(params.comfyMode ?? "text");
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="composer-comfy-fields">
        <StudioSelect
          value={mode}
          onChange={(v) => patch("comfyMode", v)}
          options={COMFY_MODES.map((m) => ({ value: m, label: m }))}
          className="min-w-[6rem]"
          data-testid="comfy-mode-select"
        />
        <input
          placeholder="工作流 JSON"
          value={String(params.workflow_json ?? "")}
          onChange={(e) => patch("workflow_json", e.target.value)}
          className={`${fieldClass} w-32`}
        />
        <button
          type="button"
          className="rounded-lg px-2.5 py-1.5 border border-gray-200 text-sm hover:border-black"
          onClick={() => patch("seed", Math.floor(Math.random() * 1e9))}
          data-testid="comfy-dice-btn"
        >
          🎲
        </button>
        {mode === "custom" && (
          <input
            placeholder="自定义字段"
            value={String(params.customField ?? "")}
            onChange={(e) => patch("customField", e.target.value)}
            className={`${fieldClass} flex-1 min-w-[120px]`}
          />
        )}
      </div>
    );
  }

  if (engine === "runninghub") {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="composer-rh-fields">
        <input
          placeholder="工作流 ID"
          value={String(params.workflow_id ?? params.workflowId ?? "")}
          onChange={(e) =>
            onChange({ ...params, workflow_id: e.target.value, workflowId: e.target.value })
          }
          className={`${fieldClass} w-36`}
          data-testid="rh-field-workflow_id"
        />
      </div>
    );
  }

  if (engine === "api" || engine === "openai" || engine === "volcengine") {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={`composer-${engine}-fields`}>
        <StudioSelect
          value={providerId}
          onChange={(next) => {
            const nextModel =
              kind === "video"
                ? resolveVideoModel(config, next, "")
                : resolveImageModel(config, next, "");
            onChange({
              ...params,
              provider_id: next,
              provider: next,
              model: nextModel,
            });
          }}
          options={[
            { value: "", label: "Provider" },
            ...providers.map((p) => ({ value: p.id, label: p.name || p.id })),
          ]}
          placeholder="Provider"
          className="min-w-[8rem]"
          data-testid="param-provider_id"
        />
        <StudioSelect
          value={model}
          onChange={(v) => patch("model", v)}
          options={[
            { value: "", label: "模型" },
            ...models.map((m) => ({ value: m, label: m })),
          ]}
          placeholder="模型"
          className="min-w-[8rem]"
          data-testid="param-model"
        />
        {kind === "video" && (
          <input
            placeholder="时长(秒)"
            type="number"
            value={String(params.duration ?? "")}
            onChange={(e) => patch("duration", Number(e.target.value))}
            className={`${fieldClass} w-20`}
            data-testid="param-duration"
          />
        )}
        {paramFields
          .filter((f) => !["provider_id", "provider", "model", "duration"].includes(f.key))
          .slice(0, 4)
          .map((f) =>
            f.options?.length ? (
              <StudioSelect
                key={f.key}
                value={String(params[f.key] ?? "")}
                onChange={(v) => patch(f.key, v)}
                options={[
                  { value: "", label: f.label ?? f.key },
                  ...f.options.map((o) => ({ value: o.value, label: o.label })),
                ]}
                placeholder={f.label ?? f.key}
                className="min-w-[6rem]"
                data-testid={`param-${f.key}`}
              />
            ) : null,
          )}
        {providers.length === 0 && (
          <span className="text-xs text-amber-600 font-serif">未配置可用 Provider — 请先到 API 设置</span>
        )}
      </div>
    );
  }

  // modelscope / others — keep free-form + dynamic fields
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`composer-${engine}-fields`}>
      <input
        placeholder="模型"
        value={model}
        onChange={(e) => patch("model", e.target.value)}
        className={`${fieldClass} w-32`}
        data-testid="param-model"
      />
      {paramFields
        .filter((f) => f.key !== "model")
        .slice(0, 3)
        .map((f) => (
          <input
            key={f.key}
            placeholder={f.label ?? f.key}
            value={String(params[f.key] ?? "")}
            onChange={(e) =>
              patch(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)
            }
            className={`${fieldClass} w-24`}
            data-testid={`param-${f.key}`}
          />
        ))}
    </div>
  );
}
