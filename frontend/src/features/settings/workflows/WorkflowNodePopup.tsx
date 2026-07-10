import { Check, X } from "lucide-react";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import type { ComfyNode } from "./workflowGraph";
import {
  formatOptionsText,
  guessFieldType,
  isLinkValue,
  parseOptionsText,
  type WorkflowField,
} from "./workflowFieldUtils";

const FIELD_TYPES = [
  { v: "text", label: "文本" },
  { v: "textarea", label: "多行" },
  { v: "number", label: "数字" },
  { v: "slider", label: "滑块" },
  { v: "dropdown", label: "下拉" },
  { v: "boolean", label: "开关" },
  { v: "image", label: "图片" },
  { v: "video", label: "视频" },
  { v: "audio", label: "音频" },
];

function formatDefault(v: unknown) {
  if (typeof v === "string") return `"${v.length > 40 ? `${v.slice(0, 40)}…` : v}"`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v ?? "");
}

interface WorkflowNodePopupProps {
  nodeId: string;
  node: ComfyNode;
  fields: WorkflowField[];
  onClose: () => void;
  onChange: (fields: WorkflowField[]) => void;
}

export function WorkflowNodePopup({
  nodeId,
  node,
  fields,
  onClose,
  onChange,
}: WorkflowNodePopupProps) {
  const inputs = Object.entries(node.inputs ?? {}).filter(([, v]) => !isLinkValue(v));

  const fieldFor = (inputKey: string) =>
    fields.find((f) => f.node === nodeId && f.input === inputKey);

  const toggleField = (inputKey: string, rawValue: unknown) => {
    const existing = fieldFor(inputKey);
    if (existing) {
      onChange(fields.filter((f) => f.id !== existing.id));
      return;
    }
    const id = `${nodeId}_${inputKey}`.replace(/[^a-zA-Z0-9_]/g, "_");
    const guessed = guessFieldType(rawValue, inputKey);
    const next: WorkflowField = {
      id,
      node: nodeId,
      input: inputKey,
      name: inputKey,
      type: guessed,
      default: rawValue,
      ...(guessed === "slider"
        ? { min: 0, max: 1, step: 0.01 }
        : guessed === "number" && typeof rawValue === "number"
          ? { min: 0, max: Math.max(rawValue * 2, 100), step: 1 }
          : {}),
    };
    onChange([...fields, next]);
  };

  const updateField = (fieldId: string, patch: Partial<WorkflowField>) => {
    onChange(fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
  };

  const renderExtras = (f: WorkflowField) => {
    if (f.type === "slider" || f.type === "number") {
      return (
        <div className="studio-graph-field-extras" data-testid={`workflow-field-extras-${f.id}`}>
          <label className="studio-graph-extra-item">
            <span>min</span>
            <input
              className="studio-field-input"
              type="number"
              value={f.min ?? ""}
              onChange={(e) =>
                updateField(f.id, { min: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label className="studio-graph-extra-item">
            <span>max</span>
            <input
              className="studio-field-input"
              type="number"
              value={f.max ?? ""}
              onChange={(e) =>
                updateField(f.id, { max: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label className="studio-graph-extra-item">
            <span>step</span>
            <input
              className="studio-field-input"
              type="number"
              value={f.step ?? ""}
              onChange={(e) =>
                updateField(f.id, { step: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </label>
          {f.type === "number" ? (
            <label className="studio-graph-extra-check">
              <input
                type="checkbox"
                checked={!!f.random_enabled}
                onChange={(e) => updateField(f.id, { random_enabled: e.target.checked })}
                data-testid={`workflow-field-random-${f.id}`}
              />
              随机
            </label>
          ) : null}
        </div>
      );
    }

    if (f.type === "dropdown") {
      return (
        <div className="studio-graph-field-extras" data-testid={`workflow-field-extras-${f.id}`}>
          <div className="studio-graph-extra-label">选项（每行一个）</div>
          <textarea
            className="studio-field-input studio-graph-options-text"
            value={formatOptionsText(f.options)}
            onChange={(e) => updateField(f.id, { options: parseOptionsText(e.target.value) })}
            data-testid={`workflow-field-options-${f.id}`}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="studio-graph-popup-backdrop" onClick={onClose} />
      <div className="studio-graph-popup" data-testid="workflow-node-popup">
        <div className="studio-graph-popup-head">
          <div>
            <div className="studio-graph-popup-title">{node._meta?.title || node.class_type || nodeId}</div>
            <div className="studio-graph-popup-sub">
              {node.class_type} · #{nodeId}
            </div>
          </div>
          <button type="button" className="studio-icon-btn" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="studio-graph-popup-body">
          {inputs.length === 0 ? (
            <div className="studio-model-empty">此节点没有可配置的输入字段</div>
          ) : (
            inputs.map(([inputKey, rawValue]) => {
              const f = fieldFor(inputKey);
              const active = !!f;
              return (
                <div
                  key={inputKey}
                  className={`studio-graph-input-row${active ? " is-active" : ""}`}
                  data-testid={`workflow-node-input-${inputKey}`}
                >
                  <button
                    type="button"
                    className={`studio-graph-check${active ? " checked" : ""}`}
                    onClick={() => toggleField(inputKey, rawValue)}
                    data-testid={`workflow-node-toggle-${inputKey}`}
                  >
                    {active && <Check className="w-3 h-3" />}
                  </button>
                  <div className="studio-graph-input-info">
                    <div className="studio-graph-input-key">{inputKey}</div>
                    <div className="studio-graph-input-orig">默认值 {formatDefault(rawValue)}</div>
                  </div>
                  <input
                    className="studio-field-input"
                    type="text"
                    placeholder="显示名"
                    disabled={!active}
                    value={active ? f.name : inputKey}
                    onChange={(e) => active && updateField(f.id, { name: e.target.value })}
                  />
                  <StudioSelect
                    disabled={!active}
                    value={active ? f.type : "text"}
                    onChange={(type) => active && updateField(f.id, { type })}
                    options={FIELD_TYPES.map((t) => ({ value: t.v, label: t.label }))}
                    data-testid={active ? `workflow-field-type-${f.id}` : undefined}
                  />
                  {active ? renderExtras(f) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
