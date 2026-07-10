import { api } from "../../../shared/api/client";
import type { EngineKind, ComposerSettings } from "./types";

export interface GenerationResult {
  url?: string;
  urls?: string[];
  text?: string;
  taskId?: string;
  pending?: boolean;
  error?: string;
}

export interface ImageParamsResponse {
  fields?: Array<{
    key: string;
    label?: string;
    type?: string;
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
}

const ENGINE_ENDPOINTS: Record<
  EngineKind,
  { path: string; method: "post" }
> = {
  api: { path: "/api/online-image", method: "post" },
  volcengine: { path: "/api/online-image", method: "post" },
  modelscope: { path: "/api/ms/generate", method: "post" },
  comfy: { path: "/api/generate", method: "post" },
  runninghub: { path: "/api/runninghub/generate", method: "post" },
  openai: { path: "/api/online-image", method: "post" },
};

export function buildGenerationPayload(
  settings: ComposerSettings,
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

export async function submitGeneration(
  settings: ComposerSettings,
  refs: string[] = [],
): Promise<GenerationResult> {
  const endpoint = ENGINE_ENDPOINTS[settings.engine];
  if (!endpoint) return { error: `Unknown engine: ${settings.engine}` };

  try {
    const payload = buildGenerationPayload(settings, refs);
    const res = await api.post<Record<string, unknown>>(endpoint.path, payload);

    if (res.task_id || res.taskId) {
      return {
        taskId: String(res.task_id ?? res.taskId),
        pending: true,
      };
    }

    const url =
      (res.url as string) ||
      (Array.isArray(res.urls) ? (res.urls as string[])[0] : undefined) ||
      (Array.isArray(res.images)
        ? ((res.images as Array<{ url?: string }>)[0]?.url)
        : undefined);

    return {
      url,
      urls: Array.isArray(res.urls) ? (res.urls as string[]) : url ? [url] : [],
      text: res.text as string | undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return { error: message };
  }
}

export async function pollImageTask(taskId: string): Promise<GenerationResult> {
  try {
    const res = await api.get<Record<string, unknown>>(
      `/api/canvas-image-tasks/${encodeURIComponent(taskId)}`,
    );
    const status = String(res.status ?? "");
    if (status === "pending" || status === "running") {
      return { taskId, pending: true };
    }
    if (status === "failed") {
      return { error: String(res.error ?? "Task failed") };
    }
    const url =
      (res.url as string) ||
      (Array.isArray(res.urls) ? (res.urls as string[])[0] : undefined);
    return { url, urls: url ? [url] : [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Poll failed" };
  }
}

export async function fetchImageParams(
  engine: EngineKind,
  kind: string,
): Promise<ImageParamsResponse> {
  try {
    return await api.get<ImageParamsResponse>(
      `/api/image-params?engine=${encodeURIComponent(engine)}&kind=${encodeURIComponent(kind)}`,
    );
  } catch {
    return { fields: [] };
  }
}

export async function pollUntilDone(
  taskId: string,
  maxAttempts = 60,
  intervalMs = 2000,
): Promise<GenerationResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await pollImageTask(taskId);
    if (!result.pending) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { error: "Task timeout" };
}
