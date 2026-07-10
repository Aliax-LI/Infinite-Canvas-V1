import type { ComposerSettings, EngineKind } from "../core/types";

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

const ENGINE_EXTRA: Partial<
  Record<EngineKind, Array<{ key: string; label: string; type?: string }>>
> = {
  api: [
    { key: "provider", label: "Provider" },
    { key: "model", label: "Model" },
    { key: "size", label: "尺寸" },
    { key: "aspect_ratio", label: "比例" },
    { key: "quality", label: "质量" },
    { key: "count", label: "数量" },
  ],
  volcengine: [
    { key: "model", label: "模型" },
    { key: "size", label: "尺寸" },
    { key: "strength", label: "强度", type: "number" },
  ],
  modelscope: [
    { key: "model", label: "模型" },
    { key: "size", label: "尺寸" },
    { key: "steps", label: "步数", type: "number" },
  ],
  openai: [
    { key: "model", label: "模型" },
    { key: "size", label: "尺寸" },
    { key: "quality", label: "质量" },
  ],
  runninghub: [
    { key: "workflow_id", label: "工作流 ID" },
    { key: "payment", label: "计费" },
    { key: "vram", label: "VRAM" },
  ],
};

export function ComposerEngineFields({
  engine,
  kind,
  params,
  paramFields,
  onChange,
}: ComposerEngineFieldsProps) {
  const patch = (key: string, value: unknown) =>
    onChange({ ...params, [key]: value });

  const extras = ENGINE_EXTRA[engine] ?? [];
  const apiFields = paramFields.length
    ? paramFields
    : extras.map((f) => ({ key: f.key, label: f.label, type: f.type }));

  if (engine === "comfy") {
    const mode = String(params.comfyMode ?? "text");
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="composer-comfy-fields">
        <select
          value={mode}
          onChange={(e) => patch("comfyMode", e.target.value)}
          className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
          data-testid="comfy-mode-select"
        >
          {COMFY_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          placeholder="工作流 ID"
          value={String(params.workflow_id ?? "")}
          onChange={(e) => patch("workflow_id", e.target.value)}
          className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm w-32"
        />
        <button
          type="button"
          className="px-2 py-1 border border-[var(--border)] text-sm"
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
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm flex-1 min-w-[120px]"
          />
        )}
      </div>
    );
  }

  if (engine === "runninghub") {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="composer-rh-fields">
        {apiFields.map((f) => (
          <input
            key={f.key}
            placeholder={f.label ?? f.key}
            value={String(params[f.key] ?? "")}
            onChange={(e) => patch(f.key, e.target.value)}
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm w-28"
            data-testid={`rh-field-${f.key}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`composer-${engine}-fields`}>
      {apiFields.map((f) =>
        f.options?.length ? (
          <select
            key={f.key}
            value={String(params[f.key] ?? "")}
            onChange={(e) => patch(f.key, e.target.value)}
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            data-testid={`param-${f.key}`}
          >
            <option value="">{f.label ?? f.key}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.key}
            type={f.type === "number" ? "number" : "text"}
            placeholder={f.label ?? f.key}
            value={String(params[f.key] ?? "")}
            onChange={(e) =>
              patch(
                f.key,
                f.type === "number" ? Number(e.target.value) : e.target.value,
              )
            }
            className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm w-24"
            data-testid={`param-${f.key}`}
          />
        ),
      )}
      {kind === "video" && engine === "api" && (
        <input
          placeholder="时长(秒)"
          type="number"
          value={String(params.duration ?? "")}
          onChange={(e) => patch("duration", Number(e.target.value))}
          className="border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm w-20"
          data-testid="param-duration"
        />
      )}
    </div>
  );
}
