import type { AiConfig } from "../../chat/types";
import type { ToolEngine } from "./EngineSwitch";

export const ANGLE_ENGINE_STORAGE_KEY = "angle_engine_mode";
export const ANGLE_CLOUD_MODEL_STORAGE_KEY = "angle_cloud_model";

export const DEFAULT_ANGLE_CLOUD_MODEL = "Qwen/Qwen-Image-Edit-2511";

export const FALLBACK_ANGLE_CLOUD_MODELS = [
  "Qwen/Qwen-Image-Edit-2511",
  "Qwen/Qwen-Image-Edit-2509",
];

export function isAngleCloudModel(modelId: string): boolean {
  const lc = String(modelId || "").toLowerCase();
  return lc.includes("qwen-image-edit") || lc.includes("qwen_image_edit");
}

export function resolveAngleCloudModels(config?: AiConfig): string[] {
  const msProvider = config?.api_providers?.find((item) => item.id === "modelscope");
  const merged = [
    ...(msProvider?.image_models ?? []),
    ...(config?.image_models ?? []),
  ];
  const filtered = [...new Set(merged.filter(isAngleCloudModel))];
  if (filtered.length) return filtered;
  return [...FALLBACK_ANGLE_CLOUD_MODELS];
}

export function resolveAngleCloudModel(config: AiConfig | undefined, remembered = ""): string {
  const models = resolveAngleCloudModels(config);
  if (remembered && models.includes(remembered)) return remembered;
  try {
    const stored = localStorage.getItem(ANGLE_CLOUD_MODEL_STORAGE_KEY);
    if (stored && models.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  if (models.includes(DEFAULT_ANGLE_CLOUD_MODEL)) return DEFAULT_ANGLE_CLOUD_MODEL;
  return models[0] ?? DEFAULT_ANGLE_CLOUD_MODEL;
}

export function resolveAngleEngine(remembered?: ToolEngine): ToolEngine {
  if (remembered === "local" || remembered === "cloud") return remembered;
  try {
    const stored = localStorage.getItem(ANGLE_ENGINE_STORAGE_KEY);
    if (stored === "local" || stored === "cloud") return stored;
  } catch {
    /* ignore */
  }
  return "local";
}

export function persistAngleEngine(engine: ToolEngine): void {
  try {
    localStorage.setItem(ANGLE_ENGINE_STORAGE_KEY, engine);
  } catch {
    /* ignore */
  }
}

export function persistAngleCloudModel(model: string): void {
  try {
    localStorage.setItem(ANGLE_CLOUD_MODEL_STORAGE_KEY, model);
  } catch {
    /* ignore */
  }
}
