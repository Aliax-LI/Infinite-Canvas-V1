import type { AiConfig } from "../../chat/types";
import type { ToolEngine } from "./EngineSwitch";

export const KLEIN_WORKFLOW = "Flux2-Klein.json";

export const KLEIN_ENGINE_STORAGE_KEY = "klein_engine_mode";
export const KLEIN_CLOUD_MODEL_STORAGE_KEY = "klein_cloud_model";

/** Legacy default — history/static/klein.html hardcoded this model. */
export const DEFAULT_KLEIN_CLOUD_MODEL = "black-forest-labs/FLUX.2-klein-9B";

export const FALLBACK_KLEIN_CLOUD_MODELS = [
  "black-forest-labs/FLUX.2-klein-9B",
  "black-forest-labs/FLUX.2-klein-4B",
  "black-forest-labs/FLUX.2-klein-base-9B",
  "black-forest-labs/FLUX.2-klein-base-4B",
  "black-forest-labs/FLUX.2-dev",
];

export function isKleinCloudModel(modelId: string): boolean {
  const lc = String(modelId || "").toLowerCase();
  return (
    lc.includes("klein") ||
    lc.includes("flux.2") ||
    lc.includes("flux2") ||
    lc.includes("flux-2")
  );
}

export function resolveKleinCloudModels(config?: AiConfig): string[] {
  const msProvider = config?.api_providers?.find((item) => item.id === "modelscope");
  const merged = [
    ...(msProvider?.image_models ?? []),
    ...(config?.image_models ?? []),
  ];
  const filtered = [...new Set(merged.filter(isKleinCloudModel))];
  if (filtered.length) return filtered;
  return [...FALLBACK_KLEIN_CLOUD_MODELS];
}

export function resolveKleinCloudModel(config: AiConfig | undefined, remembered = ""): string {
  const models = resolveKleinCloudModels(config);
  if (remembered && models.includes(remembered)) return remembered;
  try {
    const stored = localStorage.getItem(KLEIN_CLOUD_MODEL_STORAGE_KEY);
    if (stored && models.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  if (models.includes(DEFAULT_KLEIN_CLOUD_MODEL)) return DEFAULT_KLEIN_CLOUD_MODEL;
  return models[0] ?? DEFAULT_KLEIN_CLOUD_MODEL;
}

export function resolveKleinEngine(remembered?: ToolEngine): ToolEngine {
  if (remembered === "local" || remembered === "cloud") return remembered;
  try {
    const stored = localStorage.getItem(KLEIN_ENGINE_STORAGE_KEY);
    if (stored === "local" || stored === "cloud") return stored;
  } catch {
    /* ignore */
  }
  return "local";
}

export function persistKleinEngine(engine: ToolEngine): void {
  try {
    localStorage.setItem(KLEIN_ENGINE_STORAGE_KEY, engine);
  } catch {
    /* ignore */
  }
}

export function persistKleinCloudModel(model: string): void {
  try {
    localStorage.setItem(KLEIN_CLOUD_MODEL_STORAGE_KEY, model);
  } catch {
    /* ignore */
  }
}

/**
 * Align main-image size to ModelScope constraints (512–2048, multiples of 64).
 * Mirrors history/static/klein.html `computeMsSize`.
 */
export function alignKleinMsSize(width: number, height: number): { width: number; height: number } {
  const MIN = 512;
  const MAX = 2048;
  let w = Math.round(width) || 0;
  let h = Math.round(height) || 0;
  if (!w || !h) return { width: 1024, height: 1024 };
  const longest = Math.max(w, h);
  if (longest > MAX) {
    const scale = MAX / longest;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const align = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v / 64) * 64));
  return { width: align(w), height: align(h) };
}

/**
 * Local Comfy params matching history/static/klein.html submitLocal.
 * Size follows main image via workflow GetImageSize (#157) — no width/height override.
 */
export function buildKleinLocalParams(options: {
  prompt: string;
  mainImage: string;
  auxA?: string;
  auxB?: string;
}): Record<string, Record<string, unknown>> {
  const auxA = options.auxA || "";
  const auxB = options.auxB || "";
  return {
    "168": { text: options.prompt },
    "158": { noise_seed: Math.floor(Math.random() * 1_000_000) },
    "278": { image: options.mainImage },
    "270": { image: auxA },
    "292": { image: auxB },
    "313": { value: Boolean(auxA) },
    "314": { value: Boolean(auxB) },
  };
}
