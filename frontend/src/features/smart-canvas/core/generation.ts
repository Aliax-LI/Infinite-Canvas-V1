import { api } from "../../../shared/api/client";
import type {
  CanvasConnection,
  EngineKind,
  ComposerSettings,
  SmartNode,
} from "./types";

export interface GenerationResult {
  url?: string;
  urls?: string[];
  text?: string;
  taskId?: string;
  pending?: boolean;
  error?: string;
  taskType?: "image" | "comfy" | "runninghub";
  /** Fork-first: canvas-image-tasks status jimeng_pending → switch to /api/jimeng/query-media */
  jimengPending?: boolean;
  submitId?: string;
  queueInfo?: Record<string, unknown>;
  jimengKind?: string;
  jimengMessage?: string;
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

const PARAM_PROVIDER_BY_ENGINE: Record<EngineKind, string> = {
  api: "comfly",
  volcengine: "jimeng",
  modelscope: "modelscope",
  comfy: "comfy",
  runninghub: "runninghub",
  openai: "openai",
};

const ENGINE_ENDPOINTS: Record<EngineKind, { path: string }> = {
  api: { path: "/api/canvas-image-tasks" },
  volcengine: { path: "/api/canvas-image-tasks" },
  modelscope: { path: "/api/ms/generate" },
  comfy: { path: "/api/canvas-comfy-tasks" },
  runninghub: { path: "/api/runninghub/workflow-submit" },
  openai: { path: "/api/canvas-image-tasks" },
};

export function smartNodeComposer(
  node: SmartNode,
  fallback: ComposerSettings,
): ComposerSettings {
  const settings = node.settings ?? {};
  return {
    engine: (settings.engine as EngineKind | undefined) ?? fallback.engine,
    kind: (settings.kind as ComposerSettings["kind"] | undefined) ??
      (node.kind === "video" || node.kind === "text" ? node.kind : fallback.kind),
    prompt: node.prompt || fallback.prompt,
    params: settings.params && typeof settings.params === "object"
      ? (settings.params as Record<string, unknown>)
      : fallback.params,
  };
}

export function collectSmartNodeInputs(
  nodeId: string,
  nodes: SmartNode[],
  connections: CanvasConnection[],
): { prompt: string; refs: string[] } {
  const incomingIds = connections
    .filter((connection) => connection.to === nodeId)
    .map((connection) => connection.from);
  const incoming = incomingIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is SmartNode => Boolean(node));
  const target = nodes.find((node) => node.id === nodeId);
  // Smart groups are runnable containers in the history canvas. Their own
  // members are input sources even when no explicit edge enters the group.
  const members = target?.kind === "group"
    ? nodes.filter((node) =>
        node.group_id === target.id || target.member_ids?.includes(node.id),
      )
    : [];
  const sources = [...incoming, ...members].filter(
    (node, index, list) => list.findIndex((item) => item.id === node.id) === index,
  );
  return {
    prompt: sources
      .map((node) => String(node.prompt ?? "").trim())
      .filter(Boolean)
      .join("\n"),
    refs: [...new Set(sources.flatMap((node) =>
      (node.images ?? []).map((image) => image.url).filter(Boolean),
    ))],
  };
}

/** History `runApiGeneration` requires provider_id + model before POST. */
export function validateComposerForRun(settings: ComposerSettings): string | null {
  if (!settings.prompt.trim()) {
    return "请输入提示词";
  }
  if (settings.kind === "text") {
    if (!String(settings.params.model ?? "").trim()) {
      return "请选择文本模型";
    }
    return null;
  }
  if (
    settings.engine === "api" ||
    settings.engine === "openai" ||
    settings.engine === "volcengine"
  ) {
    const provider = String(
      settings.params.provider_id ?? settings.params.provider ?? "",
    ).trim();
    const model = String(settings.params.model ?? "").trim();
    if (!provider || !model) {
      return "请先选择 Provider 和模型（API 设置页配置后可在此下拉选择）";
    }
  }
  if (settings.engine === "runninghub") {
    const wf = String(
      settings.params.workflowId ?? settings.params.workflow_id ?? "",
    ).trim();
    if (!wf) return "请填写 RunningHub 工作流 ID";
  }
  if (settings.engine === "comfy") {
    const wf = String(settings.params.workflow_json ?? "").trim();
    const mode = String(settings.params.comfyMode ?? "text");
    if (mode === "custom" && !wf) return "自定义 Comfy 模式需要工作流 JSON";
  }
  return null;
}

export function buildGenerationPayload(
  settings: ComposerSettings,
  refs: string[] = [],
): Record<string, unknown> {
  const params = { ...settings.params };
  const rawReferenceImages = Array.isArray(params.reference_images)
    ? params.reference_images
    : String(params.reference_images ?? "")
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);
  const paramRefs = [params.reference, params.reference_url, ...rawReferenceImages]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const allRefs = [...new Set([...refs, ...paramRefs])];
  const base: Record<string, unknown> = {
    prompt: settings.prompt,
    engine: settings.engine,
    kind: settings.kind,
    ...params,
  };
  if (settings.kind === "text") {
    return {
      message: settings.prompt,
      provider: String(params.provider_id ?? params.provider ?? "comfly"),
      model: String(params.model ?? ""),
      ms_model: settings.engine === "modelscope" ? String(params.model ?? "") : "",
      system_prompt: String(params.system_prompt ?? "You are a helpful assistant."),
    };
  }
  if (settings.engine === "api" || settings.engine === "openai" || settings.engine === "volcengine") {
    base.provider_id = String(
      params.provider_id ??
        params.provider ??
        (settings.engine === "openai"
          ? "openai"
          : settings.engine === "volcengine"
            ? "jimeng"
            : "comfly"),
    );
    base.model = String(params.model ?? "");
    base.size = String(params.size ?? "1024x1024");
    base.quality = String(params.quality ?? "auto");
    base.n = Math.max(1, Math.min(8, Number(params.n ?? params.count ?? 1) || 1));
    if (allRefs.length) base.reference_images = allRefs.map((url) => ({ url }));
  } else if (settings.engine === "modelscope") {
    if (allRefs.length) base.image_urls = allRefs;
  } else if (settings.engine === "runninghub") {
    base.workflowId = String(params.workflowId ?? params.workflow_id ?? "");
    base.nodeInfoList = Array.isArray(params.nodeInfoList) ? params.nodeInfoList : [];
    delete base.workflow_id;
  }
  if (settings.kind === "video") {
    base.mode = "video";
    base.provider_id = String(params.provider_id ?? params.provider ?? "comfly");
    base.model = String(params.model ?? params.videoModel ?? "");
    if (allRefs.length) base.images = allRefs.map((url) => ({ url }));
  }
  return base;
}

function extractUrls(res: Record<string, unknown>): string[] {
  const nested = res.result && typeof res.result === "object"
    ? (res.result as Record<string, unknown>)
    : res;
  const values = Array.isArray(nested.urls)
    ? nested.urls
    : Array.isArray(nested.images)
      ? nested.images
      : Array.isArray(nested.videos)
        ? nested.videos
      : Array.isArray(nested.outputs)
        ? nested.outputs
        : nested.url
          ? [nested.url]
          : [];
  return values
    .map((item) => typeof item === "string" ? item : item && typeof item === "object" ? String((item as { url?: unknown }).url ?? "") : "")
    .filter(Boolean);
}

export async function submitGeneration(
  settings: ComposerSettings,
  refs: string[] = [],
): Promise<GenerationResult> {
  const endpoint = ENGINE_ENDPOINTS[settings.engine];
  if (!endpoint) return { error: `Unknown engine: ${settings.engine}` };

  const validationError = validateComposerForRun(settings);
  if (validationError) return { error: validationError };

  try {
    const payload = buildGenerationPayload(settings, refs);
    const path = settings.kind === "text"
      ? "/api/canvas-llm"
      : settings.kind === "video" && settings.engine !== "runninghub"
        ? "/api/canvas-video"
        : endpoint.path;
    const res = await api.post<Record<string, unknown>>(path, payload);

    const urls = extractUrls(res);
    if (urls.length) return { url: urls[0], urls };

    // Video / sync paths may return jimeng_pending immediately
    if (res.jimeng_pending || String(res.status ?? "").toLowerCase() === "jimeng_pending") {
      const submitId = String(res.submit_id ?? res.submitId ?? "");
      if (submitId) {
        return {
          jimengPending: true,
          submitId,
          queueInfo: (res.queue_info as Record<string, unknown>) || {},
          jimengKind: String(res.kind ?? settings.kind),
          jimengMessage: String(res.message ?? ""),
        };
      }
    }

    if (settings.engine === "runninghub") {
      const data = res.data && typeof res.data === "object"
        ? (res.data as Record<string, unknown>)
        : res;
      const taskId = data.taskId ?? data.task_id;
      return taskId
        ? { taskId: String(taskId), taskType: "runninghub", pending: true }
        : { error: "RunningHub 未返回任务 ID" };
    }

    if (res.task_id || res.taskId) {
      return {
        taskId: String(res.task_id ?? res.taskId),
        taskType: settings.engine === "comfy" ? "comfy" : "image",
        pending: true,
      };
    }
    if (res.text) return { text: String(res.text) };
    return { error: "生成接口未返回结果或任务 ID" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return { error: message };
  }
}

export async function pollImageTask(
  taskId: string,
  taskType: GenerationResult["taskType"] = "image",
): Promise<GenerationResult> {
  try {
    if (taskType === "runninghub") {
      const res = await api.get<Record<string, unknown>>(
        `/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`,
      );
      const data = res.data && typeof res.data === "object"
        ? (res.data as Record<string, unknown>)
        : res;
      const status = String(data.status ?? "").toUpperCase();
      if (status === "RUNNING" || status === "QUEUED" || status === "UNKNOWN") {
        return { taskId, taskType, pending: true };
      }
      if (status === "FAILED") return { error: String(data.failReason ?? "RunningHub 任务失败") };
      const urls = extractUrls(data);
      return urls.length ? { url: urls[0], urls } : { error: "RunningHub 任务完成但没有输出" };
    }
    const res = await api.get<Record<string, unknown>>(
      `${taskType === "comfy" ? "/api/canvas-comfy-tasks" : "/api/canvas-image-tasks"}/${encodeURIComponent(taskId)}`,
    );
    const status = String(res.status ?? "").toLowerCase();
    if (status === "jimeng_pending" || res.jimeng_pending) {
      const submitId = String(res.submit_id ?? res.submitId ?? "");
      if (!submitId) {
        return { taskId, taskType, pending: true };
      }
      return {
        jimengPending: true,
        submitId,
        taskId,
        taskType,
        queueInfo: (res.queue_info as Record<string, unknown>) || {},
        jimengKind: String(res.kind ?? "image"),
        jimengMessage: String(res.message ?? ""),
      };
    }
    if (["pending", "queued", "running"].includes(status)) {
      return { taskId, taskType, pending: true };
    }
    if (status === "failed") {
      return { error: String(res.error ?? "Task failed") };
    }
    const urls = extractUrls(res);
    return urls.length
      ? { url: urls[0], urls }
      : { error: "任务完成但没有返回结果" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Poll failed" };
  }
}

export async function fetchImageParams(
  engine: EngineKind,
  kind: string,
): Promise<ImageParamsResponse> {
  try {
    const response = await api.get<ImageParamsResponse>(
      `/api/image-params?provider_id=${encodeURIComponent(PARAM_PROVIDER_BY_ENGINE[engine])}&kind=${encodeURIComponent(kind)}`,
    );
    return {
      ...response,
      fields: (response.fields ?? []).map((field) => ({
        ...field,
        type: field.type === "int" ? "number" : field.type,
        options: Array.isArray(field.options)
          ? (field.options as unknown[]).map((option) =>
              option && typeof option === "object" && "value" in option
                ? option
                : { value: String(option), label: String(option) },
            )
          : undefined,
      })),
    };
  } catch {
    return { fields: [] };
  }
}

export async function pollUntilDone(
  taskId: string,
  maxAttempts = 60,
  intervalMs = 2000,
  taskType: GenerationResult["taskType"] = "image",
): Promise<GenerationResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await pollImageTask(taskId, taskType);
    if (result.jimengPending) return result;
    if (!result.pending) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { error: "Task timeout" };
}
