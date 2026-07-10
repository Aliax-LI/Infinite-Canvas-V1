import { api } from "../../../shared/api/client";
import type { GeneratePanelSettings } from "./types";

export interface GenerationResult {
  url?: string;
  urls?: string[];
  error?: string;
  pending?: boolean;
  taskId?: string;
}

export function buildLegacyPayload(
  settings: GeneratePanelSettings,
  refs: string[] = [],
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    prompt: settings.prompt,
    engine: settings.engine,
    kind: settings.kind,
    ...settings.params,
  };
  if (refs.length) base.reference_images = refs;
  if (settings.kind === "video") base.mode = "video";
  return base;
}

export async function submitLegacyGeneration(
  settings: GeneratePanelSettings,
  refs: string[] = [],
): Promise<GenerationResult> {
  if (!settings.prompt.trim()) {
    return { error: "请输入提示词" };
  }
  try {
    const payload = buildLegacyPayload(settings, refs);
    const res = await api.post<Record<string, unknown>>(
      settings.engine === "comfy" ? "/api/generate" : "/api/online-image",
      payload,
    );
    if (res.task_id || res.taskId) {
      return {
        pending: true,
        taskId: String(res.task_id ?? res.taskId),
      };
    }
    const url =
      (res.url as string) ||
      (Array.isArray(res.urls) ? (res.urls as string[])[0] : undefined);
    return { url, urls: url ? [url] : [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    return { error: message };
  }
}
