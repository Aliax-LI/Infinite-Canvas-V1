import { Dices, Upload } from "lucide-react";
import { useRef } from "react";
import { api } from "../../../shared/api/client";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import {
  fieldKind,
  randomPreviewValue,
  sliderBounds,
  type WorkflowField,
} from "./workflowFieldUtils";

function mediaAccept(kind: string) {
  if (kind === "video") return "video/*";
  if (kind === "audio") return "audio/*";
  return "image/*";
}

interface WorkflowFieldControlsProps {
  field: WorkflowField;
  value: unknown;
  onChange: (value: unknown) => void;
  compact?: boolean;
}

export function WorkflowFieldControls({ field, value, onChange, compact }: WorkflowFieldControlsProps) {
  const blobUrlsRef = useRef<Record<string, string>>({});
  const kind = fieldKind(field);

  const setBlobUrl = (file: File) => {
    const prev = blobUrlsRef.current[field.id];
    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
    blobUrlsRef.current[field.id] = URL.createObjectURL(file);
  };

  const displayUrl = () => {
    const blob = blobUrlsRef.current[field.id];
    if (blob) return blob;
    if (typeof value === "string" && /^(https?:|blob:|data:|\/)/.test(value)) return value;
    return "";
  };

  const uploadMedia = async (file: File) => {
    setBlobUrl(file);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api.upload<{ comfy_name?: string; filename?: string; url?: string }>(
        "/api/upload",
        form,
      );
      onChange(res.comfy_name || res.filename || res.url || file.name);
    } catch {
      onChange(file.name);
    }
  };

  if (field.type === "textarea" || kind === "prompt") {
    return (
      <textarea
        className="studio-mini-textarea"
        value={String(value ?? "")}
        placeholder={field.input}
        onChange={(e) => onChange(e.target.value)}
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
        onClick={() => onChange(!on)}
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
          onChange={(e) => onChange(parseFloat(e.target.value))}
          data-testid={`workflow-preview-slider-${field.id}`}
        />
        <input
          className="studio-mini-input studio-mini-slider-value"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(num) ? num : min}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
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
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          data-testid={`workflow-preview-input-${field.id}`}
        />
        {field.random_enabled ? (
          <button
            type="button"
            className="studio-mini-random-btn"
            title="随机"
            onClick={() => onChange(randomPreviewValue(field))}
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
        onChange={onChange}
        options={options.length ? options : [{ value: "", label: "（无选项）" }]}
        data-testid={`workflow-preview-select-${field.id}`}
      />
    );
  }

  if (field.type === "image" || field.type === "video" || field.type === "audio") {
    const url = displayUrl();
    return (
      <label className={`studio-mini-media-drop${compact ? " compact" : ""}`}>
        <input
          type="file"
          accept={mediaAccept(field.type)}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadMedia(file);
          }}
          data-testid={`workflow-preview-file-${field.id}`}
        />
        {url && field.type === "image" ? (
          <img src={url} alt="" className="studio-mini-media-thumb" />
        ) : url && field.type === "video" ? (
          <video src={url} muted controls className="studio-mini-media-thumb" />
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
      onChange={(e) => onChange(e.target.value)}
      data-testid={`workflow-preview-input-${field.id}`}
    />
  );
}
