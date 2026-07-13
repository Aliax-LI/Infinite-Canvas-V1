/** Classic canvas ModelScope generation tabs — aligned with history `MS_GEN_MODELS`. */

export type MsGenModelKey = "zimage" | "qwen_edit" | "klein_edit" | "custom";

export interface MsGenModelDef {
  key: MsGenModelKey;
  /** Visible tab label (ZImage / Qwen Edit / Klein); custom uses i18n. */
  label: string;
  labelKey?: string;
  modelId: string;
  /** Requires at least one wired image before run. */
  supportsImage: boolean;
  /** Accepts optional reference images (custom). */
  acceptsImage: boolean;
  endpoint: string;
}

export const MS_GEN_MODELS: Record<MsGenModelKey, MsGenModelDef> = {
  zimage: {
    key: "zimage",
    label: "ZImage",
    modelId: "Tongyi-MAI/Z-Image-Turbo",
    supportsImage: false,
    acceptsImage: false,
    // History used POST /generate (ModelScope cloud). New stack maps to /api/ms/generate
    // (Vite only proxies /api/*; /api/generate is ComfyUI and must not be used here).
    endpoint: "/api/ms/generate",
  },
  qwen_edit: {
    key: "qwen_edit",
    label: "Qwen Edit",
    modelId: "Qwen/Qwen-Image-Edit-2511",
    supportsImage: true,
    acceptsImage: false,
    endpoint: "/api/angle/generate",
  },
  klein_edit: {
    key: "klein_edit",
    label: "Klein",
    modelId: "black-forest-labs/FLUX.2-klein-9B",
    supportsImage: true,
    acceptsImage: false,
    endpoint: "/api/ms/generate",
  },
  custom: {
    key: "custom",
    label: "自定义",
    labelKey: "custom",
    modelId: "",
    supportsImage: false,
    acceptsImage: true,
    endpoint: "/api/ms/generate",
  },
};

export const MS_GEN_MODEL_KEYS = Object.keys(MS_GEN_MODELS) as MsGenModelKey[];

export function resolveMsGenModelKey(raw: unknown): MsGenModelKey {
  const key = String(raw ?? "zimage");
  return key in MS_GEN_MODELS ? (key as MsGenModelKey) : "zimage";
}

export function msGenModelDef(raw: unknown): MsGenModelDef {
  return MS_GEN_MODELS[resolveMsGenModelKey(raw)];
}

export function msUsesImages(raw: unknown): boolean {
  const def = msGenModelDef(raw);
  return Boolean(def.supportsImage || def.acceptsImage);
}

/** Compact ratio labels matching history MS node selects. */
export const MS_RATIO_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "square", label: "1:1" },
  { id: "portrait", label: "2:3" },
  { id: "landscape", label: "3:2" },
  { id: "portrait43", label: "3:4" },
  { id: "landscape43", label: "4:3" },
  { id: "story", label: "9:16" },
  { id: "wide", label: "16:9" },
];

export const MS_RESOLUTION_OPTIONS = ["1k", "2k", "4k"] as const;
