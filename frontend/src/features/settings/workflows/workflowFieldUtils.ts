export interface WorkflowField {
  id: string;
  node: string;
  input: string;
  name: string;
  type: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  random_enabled?: boolean;
}

export type PreviewValues = Record<string, unknown>;

export function isLinkValue(v: unknown) {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number";
}

export function guessFieldType(value: unknown, inputName: string): string {
  const lc = (inputName || "").toLowerCase();
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    if (/strength|cfg|denoise|weight/.test(lc)) return "slider";
    return "number";
  }
  if (typeof value === "string") {
    if (/prompt|text|description|caption/.test(lc) || value.length > 60) return "textarea";
    if (/video|movie|mp4|webm|mov|m4v|vhs/.test(lc) || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(value)) {
      return "video";
    }
    if (/audio|sound|music|voice|wav|mp3/.test(lc) || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(value)) {
      return "audio";
    }
    if (/image|img|mask|filename|file/.test(lc) || /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|$)/i.test(value)) {
      return "image";
    }
    return "text";
  }
  return "text";
}

export function fieldKind(field: WorkflowField): "prompt" | "image" | "video" | "audio" | "setting" {
  if (field.type === "image" || field.type === "video" || field.type === "audio") {
    return field.type;
  }
  const key = `${field.input || ""} ${field.name || ""}`.toLowerCase();
  if (field.type === "textarea" || /prompt|text|提示词|正向|负向/.test(key)) {
    return "prompt";
  }
  return "setting";
}

export function defaultPreviewValue(field: WorkflowField): unknown {
  if (field.default !== undefined && field.default !== null && field.default !== "") {
    return field.default;
  }
  if (field.type === "boolean") return false;
  if (field.type === "number" || field.type === "slider") return field.min ?? 0;
  if (field.type === "dropdown") return field.options?.[0] ?? "";
  return "";
}

export function buildPreviewValues(fields: WorkflowField[], prev: PreviewValues = {}): PreviewValues {
  const next: PreviewValues = {};
  for (const field of fields) {
    next[field.id] = field.id in prev ? prev[field.id] : defaultPreviewValue(field);
  }
  return next;
}

export function sliderBounds(field: WorkflowField) {
  const min = Number.isFinite(field.min) ? Number(field.min) : 0;
  const max = Number.isFinite(field.max) ? Number(field.max) : 1;
  const step = Number.isFinite(field.step) ? Number(field.step) : 0.01;
  return { min, max, step };
}

export function parseOptionsText(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatOptionsText(options: string[] | undefined): string {
  return (options ?? []).join("\n");
}

export function randomPreviewValue(field: WorkflowField): number {
  const { min, max } = sliderBounds(field);
  const span = Math.max(max - min, 1);
  return Math.floor(min + Math.random() * (span + 1));
}
