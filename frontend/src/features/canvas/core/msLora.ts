import type { AiConfig, AiConfigMsLora } from "../../chat/types";
import { msGenModelDef, type MsGenModelKey } from "./msGenModels";

export interface MsLoraOption {
  id: string;
  name: string;
  target_model: string;
  strength: number;
}

function modelscopeProvider(config?: AiConfig) {
  return config?.api_providers?.find((p) => p.id === "modelscope");
}

export function modelscopeImageModels(
  config?: AiConfig,
  selected = "",
): string[] {
  const provider = modelscopeProvider(config);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [
    selected,
    ...(provider?.image_models ?? []),
    "Tongyi-MAI/Z-Image-Turbo",
    "black-forest-labs/FLUX.2-klein-9B",
  ]) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function currentMsModelId(
  modelKey: MsGenModelKey | string,
  settings: Record<string, unknown> | undefined,
  config?: AiConfig,
): string {
  if (String(modelKey) === "custom") {
    return (
      String(settings?.msCustomModel ?? "").trim() ||
      modelscopeImageModels(config)[0] ||
      "Tongyi-MAI/Z-Image-Turbo"
    );
  }
  return msGenModelDef(modelKey).modelId;
}

export function modelscopeLorasForModel(
  config: AiConfig | undefined,
  modelId: string,
): MsLoraOption[] {
  const list = modelscopeProvider(config)?.ms_loras ?? [];
  const target = String(modelId || "").trim();
  return list
    .filter((lora: AiConfigMsLora) => {
      if (!lora || lora.enabled === false) return false;
      const id = String(lora.id || "").trim();
      if (!id) return false;
      const bound = String(lora.target_model || lora.model || "").trim();
      return bound === target;
    })
    .map((lora) => ({
      id: String(lora.id || "").trim(),
      name: String(lora.name || lora.id || "").trim(),
      target_model: String(lora.target_model || lora.model || "").trim(),
      strength: Number(lora.strength ?? 0.8) || 0.8,
    }));
}
