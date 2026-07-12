import { api, apiFetch } from "../../../shared/api/client";

import { normalizeGenerationError } from "../../../shared/api/formatError";

import type { GeneratePanelSettings } from "./types";



export interface GenerationResult {

  url?: string;

  urls?: string[];

  error?: string;

  pending?: boolean;

  taskId?: string;

}



/** POST submit timeout (canvas-image-tasks returns immediately). */

export const GENERATION_SUBMIT_TIMEOUT_MS = 60_000;

/** Max wall-clock time for polling a canvas task (history polls until done). */

export const GENERATION_POLL_MAX_MS = 600_000;

/** Poll interval — matches history canvas.js sleep(1800). */

export const GENERATION_POLL_INTERVAL_MS = 1800;



const DEFAULT_ONLINE_SIZE = "1024x1024";

const DEFAULT_COMFY_WORKFLOW = "z-image-t2i.json";



const CANVAS_TASK_PENDING = new Set(["pending", "running", "queued", "jimeng_pending"]);



function refObjects(urls: string[]): Array<{ url: string }> {

  return urls.filter(Boolean).map((url) => ({ url }));

}



/** Map API response fields to URL list (history returns `images` / Comfy returns `outputs`). */

export function extractGenerationUrls(

  res: Record<string, unknown>,

): string[] {

  if (typeof res.error === "string" && res.error.trim()) {

    return [];

  }



  const fromImages = Array.isArray(res.images)

    ? res.images.map(normalizeMediaUrl).filter(Boolean)

    : [];

  if (fromImages.length) return fromImages;



  const fromOutputs = Array.isArray(res.outputs)

    ? res.outputs.map(normalizeMediaUrl).filter(Boolean)

    : [];

  if (fromOutputs.length) return fromOutputs;

  const fromVideos = Array.isArray(res.videos)
    ? res.videos.map(normalizeMediaUrl).filter(Boolean)
    : [];
  if (fromVideos.length) return fromVideos;



  const direct = normalizeMediaUrl(res.url);

  if (direct) return [direct];



  if (Array.isArray(res.urls)) {

    return (res.urls as unknown[]).map(normalizeMediaUrl).filter(Boolean);

  }



  return [];

}



function normalizeMediaUrl(value: unknown): string {

  if (typeof value === "string") return value.trim();

  if (value && typeof value === "object" && "url" in value) {

    return String((value as { url?: string }).url ?? "").trim();

  }

  return "";

}



export function isCanvasTaskPending(status: unknown): boolean {

  return CANVAS_TASK_PENDING.has(String(status ?? "").toLowerCase());

}



/** Parse GET /api/canvas-image-tasks/{id} (status: queued|running|succeeded|failed). */

export function parseCanvasImageTaskPoll(

  res: Record<string, unknown>,

  taskId: string,

): GenerationResult {

  const status = String(res.status ?? "").toLowerCase();

  if (isCanvasTaskPending(status)) {

    return { taskId, pending: true };

  }

  if (status === "failed") {

    return { error: normalizeGenerationError(String(res.error ?? "生成失败")) };

  }

  if (status === "succeeded") {

    const result =

      res.result && typeof res.result === "object"

        ? (res.result as Record<string, unknown>)

        : res;

    const urls = extractGenerationUrls(result);

    if (!urls.length) {

      return { error: "生成完成但未返回图片" };

    }

    return { url: urls[0], urls, taskId };

  }

  const urls = extractGenerationUrls(res);

  if (urls.length) {

    return { url: urls[0], urls, taskId };

  }

  return { taskId, pending: true };

}



export async function apiPostWithTimeout<T>(

  path: string,

  body: unknown,

  timeoutMs = GENERATION_SUBMIT_TIMEOUT_MS,

): Promise<T> {

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {

    return await apiFetch<T>(path, {

      method: "POST",

      body: JSON.stringify(body),

      signal: controller.signal,

    });

  } catch (err) {

    if (err instanceof Error && err.name === "AbortError") {

      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s）`);

    }

    throw err;

  } finally {

    clearTimeout(timer);

  }

}



export function buildLegacyPayload(

  settings: GeneratePanelSettings,

  refs: string[] = [],

): Record<string, unknown> {

  const prompt = settings.prompt.trim();

  const refPayload = refObjects(refs);



  if (settings.engine === "comfy") {

    const params = { ...settings.params };

    const width = Number(params.width ?? 1024);

    const height = Number(params.height ?? 1024);

    delete params.width;

    delete params.height;

    return {

      prompt,

      width: Number.isFinite(width) ? width : 1024,

      height: Number.isFinite(height) ? height : 1024,

      workflow_json: String(params.workflow_json ?? DEFAULT_COMFY_WORKFLOW),

      type: String(params.type ?? "zimage"),

      params,

    };

  }



  const params = { ...settings.params };

  const payload: Record<string, unknown> = {

    prompt,

    provider_id: String(params.provider_id ?? "comfly"),

    model: String(params.model ?? ""),

    size: String(params.size ?? DEFAULT_ONLINE_SIZE),

    quality: String(params.quality ?? "auto"),

    n: Math.max(1, Math.min(8, Number(params.n ?? 1) || 1)),

  };

  if (refPayload.length) payload.reference_images = refPayload;

  return payload;

}



/** Fork-first: history `createCanvasImageTask` → POST /api/canvas-image-tasks. */

export async function submitCanvasImageTask(

  payload: Record<string, unknown>,

): Promise<GenerationResult> {

  try {

    const res = await apiPostWithTimeout<Record<string, unknown>>(

      "/api/canvas-image-tasks",

      payload,

    );

    const taskId = res.task_id ?? res.taskId;

    if (!taskId) {

      return { error: "未返回画布任务 ID" };

    }

    return { taskId: String(taskId), pending: true };

  } catch (err) {

    const message = err instanceof Error ? err.message : "提交生成任务失败";

    return { error: normalizeGenerationError(message) };

  }

}



export async function pollLegacyImageTask(

  taskId: string,

  taskType: "image" | "comfy" = "image",

): Promise<GenerationResult> {

  try {

    const res = await api.get<Record<string, unknown>>(

      `${taskType === "comfy" ? "/api/canvas-comfy-tasks" : "/api/canvas-image-tasks"}/${encodeURIComponent(taskId)}`,

    );

    return parseCanvasImageTaskPoll(res, taskId);

  } catch (err) {

    const message = err instanceof Error ? err.message : "轮询失败";

    return { error: normalizeGenerationError(message) };

  }

}



export async function pollLegacyUntilDone(

  taskId: string,

  maxAttempts = 120,

  intervalMs = GENERATION_POLL_INTERVAL_MS,

  maxMs = GENERATION_POLL_MAX_MS,

  taskType: "image" | "comfy" = "image",

): Promise<GenerationResult> {

  const deadline = Date.now() + maxMs;

  const attempts = Math.min(

    maxAttempts,

    Math.ceil(maxMs / Math.max(intervalMs, 1)),

  );

  for (let i = 0; i < attempts; i++) {

    if (Date.now() >= deadline) break;

    const result = await pollLegacyImageTask(taskId, taskType);

    if (!result.pending) return result;

    const remaining = deadline - Date.now();

    if (remaining <= 0) break;

    await new Promise((r) =>

      setTimeout(r, Math.min(intervalMs, remaining)),

    );

  }

  return { error: "生成超时" };

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

    if (settings.engine === "comfy") {

      const submitted = await apiPostWithTimeout<Record<string, unknown>>(
        "/api/canvas-comfy-tasks",
        payload,
      );
      if (typeof submitted.error === "string" && submitted.error.trim()) {
        return { error: submitted.error.trim() };
      }
      const taskId = String(submitted.task_id ?? submitted.taskId ?? "");
      if (!taskId) return { error: "ComfyUI 未返回画布任务 ID" };
      return pollLegacyUntilDone(
        taskId,
        120,
        GENERATION_POLL_INTERVAL_MS,
        GENERATION_POLL_MAX_MS,
        "comfy",
      );

    }



    const submitted = await submitCanvasImageTask(payload);

    if (submitted.error || !submitted.taskId) return submitted;

    return pollLegacyUntilDone(submitted.taskId);

  } catch (err) {

    const message = err instanceof Error ? err.message : "生成失败";

    return { error: message };

  }

}
