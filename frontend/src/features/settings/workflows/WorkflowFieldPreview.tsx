import { Dices, Play, Upload, Workflow } from "lucide-react";
import { useRef } from "react";
import { api } from "../../../shared/api/client";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import {
  fieldKind,
  randomPreviewValue,
  sliderBounds,
  type PreviewValues,
  type WorkflowField,
} from "./workflowFieldUtils";

interface WorkflowFieldPreviewProps {
  title: string;
  fields: WorkflowField[];
  values: PreviewValues;
  onChange: (fieldId: string, value: unknown) => void;
  large?: boolean;
  onRun?: () => void;
  running?: boolean;
  runResultUrl?: string;
  runMessage?: string;
}

function mediaAccept(kind: string) {
  if (kind === "video") return "video/*";
  if (kind === "audio") return "audio/*";
  return "image/*";
}

function previewDisplayUrl(field: WorkflowField, value: unknown, blobUrls: Record<string, string>) {
  const blob = blobUrls[field.id];
  if (blob) return blob;
  if (typeof value === "string" && /^(https?:|blob:|data:)/.test(value)) return value;
  return "";
}

export function WorkflowFieldPreview({
  title,
  fields,
  values,
  onChange,
  large = false,
  onRun,
  running,
  runResultUrl,
  runMessage,
}: WorkflowFieldPreviewProps) {
  const blobUrlsRef = useRef<Record<string, string>>({});

  const setBlobUrl = (fieldId: string, file: File) => {
    const prev = blobUrlsRef.current[fieldId];
    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
    blobUrlsRef.current[fieldId] = URL.createObjectURL(file);
  };

  const uploadMedia = async (field: WorkflowField, file: File) => {
    setBlobUrl(field.id, file);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api.upload<{ comfy_name?: string; filename?: string; url?: string }>(
        "/api/upload",
        form,
      );
      onChange(field.id, res.comfy_name || res.filename || res.url || file.name);
    } catch {
      onChange(field.id, file.name);
    }
  };

  const renderField = (field: WorkflowField) => {
    const value = values[field.id];
    const kind = fieldKind(field);
    const label = field.name || field.input;

    if (field.type === "textarea" || kind === "prompt") {
      return (
        <textarea
          className="studio-mini-textarea"
          value={String(value ?? "")}
          placeholder={field.input}
          onChange={(e) => onChange(field.id, e.target.value)}
          data-testid={`workflow-preview-input-${field.id}`}
        />
      );
    }

    if (field.type === "boolean") {
      const on = Boolean(value);
      return (
        <button
          type="button"
          className={`studio-mini-bool-track${on ? " is-on" : ""}`}
          onClick={() => onChange(field.id, !on)}
          data-testid={`workflow-preview-bool-${field.id}`}
        >
          <div className="studio-mini-bool-thumb" />
        </button>
      );
    }

    if (field.type === "slider") {
      const { min, max, step } = sliderBounds(field);
      const num = Number(value ?? min);
      return (
        <div className="studio-mini-slider-row">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(num) ? num : min}
            onChange={(e) => onChange(field.id, parseFloat(e.target.value))}
            data-testid={`workflow-preview-slider-${field.id}`}
          />
          <input
            className="studio-mini-input studio-mini-slider-value"
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(num) ? num : min}
            onChange={(e) => onChange(field.id, parseFloat(e.target.value) || 0)}
          />
        </div>
      );
    }

    if (field.type === "number") {
      const num = Number(value ?? 0);
      return (
        <div className="studio-mini-random-row">
          <input
            className="studio-mini-input"
            type="number"
            value={Number.isFinite(num) ? num : 0}
            onChange={(e) => onChange(field.id, parseFloat(e.target.value) || 0)}
            data-testid={`workflow-preview-input-${field.id}`}
          />
          {field.random_enabled ? (
            <button
              type="button"
              className="studio-mini-random-btn"
              title="随机"
              onClick={() => onChange(field.id, randomPreviewValue(field))}
              data-testid={`workflow-preview-random-${field.id}`}
            >
              <Dices className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      );
    }

    if (field.type === "dropdown") {
      const options = (field.options ?? []).map((opt) => ({ value: opt, label: opt }));
      return (
        <StudioSelect
          value={String(value ?? "")}
          onChange={(next) => onChange(field.id, next)}
          options={options.length ? options : [{ value: "", label: "（无选项）" }]}
          data-testid={`workflow-preview-select-${field.id}`}
        />
      );
    }

    if (field.type === "image" || field.type === "video" || field.type === "audio") {
      const displayUrl = previewDisplayUrl(field, value, blobUrlsRef.current);
      return (
        <label className="studio-mini-media-drop">
          <input
            type="file"
            accept={mediaAccept(field.type)}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadMedia(field, file);
            }}
            data-testid={`workflow-preview-file-${field.id}`}
          />
          {displayUrl && field.type === "image" ? (
            <img src={displayUrl} alt="" className="studio-mini-media-thumb" />
          ) : displayUrl && field.type === "video" ? (
            <video src={displayUrl} muted controls className="studio-mini-media-thumb" />
          ) : (
            <span className="studio-mini-media-placeholder">
              <Upload className="w-3.5 h-3.5" />
              点击上传{field.type === "video" ? "视频" : field.type === "audio" ? "音频" : "图片"}
            </span>
          )}
          <span className="studio-mini-media-name">{String(value ?? "")}</span>
        </label>
      );
    }

    return (
      <input
        className="studio-mini-input"
        type="text"
        value={String(value ?? "")}
        placeholder={field.input}
        onChange={(e) => onChange(field.id, e.target.value)}
        data-testid={`workflow-preview-input-${field.id}`}
      />
    );
  };

  return (
    <div
      className={`studio-mini-canvas${large ? " large" : ""}`}
      data-testid={large ? "workflow-test-canvas" : "workflow-sidebar-preview"}
    >
      <div className="studio-mini-comfy-card">
        <div className="studio-mini-comfy-head">
          <Workflow className="w-3.5 h-3.5" />
          <span>{title} · Comfy 节点</span>
        </div>
        <div className="studio-mini-comfy-body">
          <div className="studio-mini-section-label">暴露到画布的输入</div>
          {fields.length === 0 ? (
            <div className="studio-model-empty">勾选节点输入字段后，可在此编辑预览值</div>
          ) : (
            <div className="studio-mini-field-list">
              {fields.map((f) => (
                <div key={f.id} className="studio-mini-field" data-testid={`workflow-preview-field-${f.id}`}>
                  <div className="studio-mini-field-label">{f.name || f.input}</div>
                  {renderField(f)}
                  <div className="studio-mini-field-meta">
                    node {f.node} · {f.type}
                  </div>
                </div>
              ))}
            </div>
          )}
          {large && onRun && (
            <button
              type="button"
              className="studio-action-btn primary studio-mini-run"
              onClick={onRun}
              disabled={running || fields.length === 0}
              data-testid="workflow-run-test-btn"
            >
              <Play className="w-4 h-4" />
              {running ? "运行中..." : "运行测试"}
            </button>
          )}
          {large && runMessage ? (
            <div className="studio-mini-run-message" data-testid="workflow-run-message">
              {runMessage}
            </div>
          ) : null}
          {large && runResultUrl ? (
            <div className="studio-mini-run-result" data-testid="workflow-run-result">
              <img src={runResultUrl} alt="运行结果" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
