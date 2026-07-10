export const LORA_ID_CUSTOM = "__custom__";

export interface LoraIdOption {
  value: string;
  label: string;
}

export interface MsLora {
  id: string;
  name?: string;
  target_model: string;
  strength: number;
  enabled?: boolean;
  note?: string;
}

export function normalizeLoraStrength(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.8;
  return Math.max(0, Math.min(2, n));
}

export function uniqueModels(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const item = String(raw ?? "").trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function buildLoraTargetOptions(imageModels: string[], selected?: string): string[] {
  return uniqueModels([
    ...(selected ? [selected] : []),
    ...imageModels,
  ]);
}

export function buildLoraIdOptions(
  loras: MsLora[],
  selectedId?: string,
  catalog: LoraIdOption[] = [],
): LoraIdOption[] {
  const seen = new Set<string>();
  const options: LoraIdOption[] = [];

  const add = (id: string, label: string) => {
    const trimmed = String(id ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    options.push({ value: trimmed, label: label || trimmed });
  };

  if (selectedId) {
    add(selectedId, selectedId);
  }

  for (const item of catalog) {
    add(item.value, item.label);
  }

  for (const lora of loras) {
    const id = String(lora.id ?? "").trim();
    if (id) add(id, lora.name || id);
  }

  return options;
}

export function defaultLoraTargetModel(imageModels: string[]): string {
  return imageModels[0] ?? "";
}

export function createEmptyLora(imageModels: string[]): MsLora {
  return {
    id: "",
    name: "",
    target_model: defaultLoraTargetModel(imageModels),
    strength: 0.8,
    enabled: true,
    note: "",
  };
}

export function normalizeMsLoras(loras: MsLora[] | undefined): MsLora[] {
  const normalized: MsLora[] = [];
  const seen = new Set<string>();

  for (const raw of loras ?? []) {
    const id = String(raw.id ?? "").trim();
    const targetModel = String(raw.target_model ?? "").trim();
    if (!id || !targetModel) continue;
    const key = `${targetModel}::${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      id,
      name: String(raw.name ?? id).trim() || id,
      target_model: targetModel,
      strength: normalizeLoraStrength(raw.strength),
      enabled: raw.enabled !== false,
      note: String(raw.note ?? "").trim(),
    });
  }

  return normalized;
}
