import { api } from "../../../shared/api/client";
import type { AiConfig } from "../../chat/types";
import {
  chatCapableProviders,
  imageCapableProviders,
  pickDefaultImageProvider,
  resolveChatModel,
  resolveImageModel,
  videoCapableProviders,
  resolveVideoModel,
} from "../../chat/providers";
import {
  buildLegacyPayload,
  apiPostWithTimeout,
  extractGenerationUrls,
  pollLegacyUntilDone,
  submitCanvasImageTask,
  type GenerationResult,
} from "./generation";
import { collectGenerationInput, collectLlmInput } from "./nodeSources";
import {
  legacyNodesFromResultUrls,
  nextAppendPosition,
} from "./addResultToCanvas";
import type { LegacyConnection, LegacyNode, ViewportState } from "./types";
import { type OnlineResolution } from "../../tools/pages/onlineSize";
import { resolveGeneratorApiSize } from "./sourceRatio";
import {
  buildLtxDirectorComfyParams,
  LTX_DIRECTOR_WORKFLOW,
  readLtxTimeline,
} from "./ltxTimeline";

const DEFAULT_VIDEO_MODEL = "veo3-fast";

function readNodeApiSettings(node: LegacyNode, config?: AiConfig) {
  const s = node.settings ?? {};
  const providerId =
    String(s.apiProvider ?? s.provider_id ?? "") ||
    pickDefaultImageProvider(config, "");
  const model =
    String(s.model ?? "") || resolveImageModel(config, providerId, "");
  const ratio = String(s.ratio ?? "square");
  const resolution = String(s.resolution ?? "1k") as OnlineResolution;
  const quality = String(s.quality ?? "auto");
  const count = Math.max(1, Math.min(8, Number(s.count ?? 1) || 1));
  const customRatio = String(s.customRatio ?? "");
  const customSize = String(s.customSize ?? "");
  const size = String(s.size ?? "");
  return {
    providerId,
    model,
    ratio,
    resolution,
    quality,
    count,
    customRatio,
    customSize,
    size,
  };
}

function readNodeVideoSettings(node: LegacyNode, config?: AiConfig) {
  const s = node.settings ?? {};
  const providers = videoCapableProviders(config);
  const providerId =
    String(s.apiProvider ?? s.provider_id ?? "") ||
    providers[0]?.id ||
    "comfly";
  const model =
    String(s.model ?? "") ||
    resolveVideoModel(config, providerId, "") ||
    DEFAULT_VIDEO_MODEL;
  return {
    providerId,
    model,
    duration: Number(s.duration ?? 5),
    aspectRatio: String(s.aspectRatio ?? "16:9"),
    resolution: String(s.resolution ?? ""),
  };
}

function readNodeComfySettings(node: LegacyNode) {
  const s = node.settings ?? {};
  return {
    workflow_json: String(s.workflow_json ?? "z-image-t2i.json"),
    type: String(s.type ?? "zimage"),
    width: Number(s.width ?? 1024),
    height: Number(s.height ?? 1024),
  };
}

export interface RunNodeOutcome extends GenerationResult {
  resultNodes?: LegacyNode[];
  outputText?: string;
}

export interface RunLoopContext {
  loopIndex?: number;
  loopTotal?: number;
  runId?: string;
}

type RunningHubNodeInfo = {
  nodeId?: string;
  fieldName?: string;
  fieldValue?: unknown;
  fieldType?: string;
  [key: string]: unknown;
};

export function mapRunningHubInputs(
  nodeInfoList: RunningHubNodeInfo[],
  prompt: string,
  uploadedRefs: string[],
): { items: RunningHubNodeInfo[]; mappedPrompt: boolean; mappedRefs: number } {
  let mappedPrompt = false;
  let refIndex = 0;
  const items = nodeInfoList.map((item) => {
    const fieldName = String(item.fieldName ?? "").toLowerCase();
    const fieldType = String(item.fieldType ?? "").toUpperCase();
    const isNegative = fieldName.includes("negative");
    const isPrompt = !isNegative && (
      fieldType.includes("TEXT") ||
      fieldName.includes("prompt") ||
      fieldName.includes("text") ||
      fieldName.includes("description")
    );
    const isImage =
      fieldType.includes("IMAGE") ||
      ["image", "img", "photo", "filename", "file_name"].some((part) =>
        fieldName.includes(part),
      );
    if (isImage && refIndex < uploadedRefs.length) {
      const next = { ...item, fieldValue: uploadedRefs[refIndex] };
      refIndex += 1;
      return next;
    }
    if (isPrompt && prompt && !mappedPrompt) {
      mappedPrompt = true;
      return { ...item, fieldValue: prompt };
    }
    return { ...item };
  });
  return { items, mappedPrompt, mappedRefs: refIndex };
}

async function loadRunningHubNodeInfo(
  mode: string,
  workflowId: string,
  webappId: string,
): Promise<RunningHubNodeInfo[]> {
  const endpoint = mode === "app"
    ? `/api/runninghub/app-info?webappId=${encodeURIComponent(webappId)}`
    : `/api/runninghub/workflow-info?workflowId=${encodeURIComponent(workflowId)}`;
  const response = await api.get<Record<string, unknown>>(endpoint);
  const data = (response.data ?? response) as Record<string, unknown>;
  const candidates = data.nodeInfoList ?? data.node_info_list ?? data.inputs;
  return Array.isArray(candidates)
    ? (candidates.filter((item) => item && typeof item === "object") as RunningHubNodeInfo[])
    : [];
}

async function uploadRunningHubReferences(refs: string[]): Promise<string[]> {
  const uploaded: string[] = [];
  for (const url of refs) {
    const response = await api.post<Record<string, unknown>>(
      "/api/runninghub/upload-asset",
      { url },
    );
    const data = (response.data ?? response) as Record<string, unknown>;
    const fileName = String(data.fileName ?? data.filename ?? "").trim();
    if (!fileName) throw new Error("RunningHub 参考图上传后未返回文件名");
    uploaded.push(fileName);
  }
  return uploaded;
}

/** Fork-first: history `runGeneratorLegacy` + `runCanvasGenerate` for generator nodes. */
export async function runGeneratorNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  config?: AiConfig,
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  const { prompt: wiredPrompt, refs } = collectGenerationInput(
    node,
    nodes,
    connections,
    loopCtx,
  );
  const nodePrompt = String(node.prompt ?? "").trim();
  const prompt = wiredPrompt || nodePrompt;
  if (!prompt && !refs.length) {
    return { error: "需要提示词或参考图" };
  }

  const apiSettings = readNodeApiSettings(node, config);
  const size = await resolveGeneratorApiSize({
    ratio: apiSettings.ratio,
    resolution: apiSettings.resolution,
    customRatio: apiSettings.customRatio,
    customSize: apiSettings.customSize,
    size: apiSettings.size,
    refUrls: refs,
  });
  const payload = buildLegacyPayload(
    {
      prompt: prompt || "Edit the reference images.",
      engine: "api",
      kind: "image",
      params: {
        provider_id: apiSettings.providerId,
        model: apiSettings.model,
        size,
        quality: apiSettings.quality,
        n: apiSettings.count,
      },
    },
    refs,
  );

  try {
    // Fork-first: history runGenerator → createCanvasImageTask + pollCanvasImageTask
    // (not blocking POST /api/online-image).
    const submitted = await submitCanvasImageTask(payload);
    if (submitted.error) return { error: submitted.error };
    const taskId = submitted.taskId;
    if (!taskId) return { error: "未返回画布任务 ID" };

    const polled = await pollLegacyUntilDone(taskId);
    if (polled.error) return { error: polled.error };
    const urls = polled.urls?.length
      ? polled.urls
      : polled.url
        ? [polled.url]
        : [];
    if (!urls.length) return { error: "生成完成但未返回图片" };

    const pos = nextAppendPosition(nodes, viewport ?? { x: 0, y: 0, scale: 1 });
    const resultNodes = legacyNodesFromResultUrls(
      urls,
      pos.x,
      pos.y,
      "生成结果",
    ).map((n) => ({
      ...n,
      prompt: prompt || nodePrompt,
      kind: "generator",
      images: n.images.map((img) => ({ ...img, kind: "generator" })),
    }));

    return { urls, url: urls[0], resultNodes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "生成失败" };
  }
}

/** Fork-first: history `runComfyNode` (simplified — single workflow POST). */
export async function runComfyNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  const { prompt: wiredPrompt, refs } = collectGenerationInput(
    node,
    nodes,
    connections,
    loopCtx,
  );
  const nodePrompt = String(node.prompt ?? "").trim();
  const prompt = wiredPrompt || nodePrompt;
  if (!prompt && !refs.length) {
    return { error: "需要提示词或参考图" };
  }

  const comfy = readNodeComfySettings(node);
  const payload = buildLegacyPayload(
    {
      prompt: prompt || "enhance",
      engine: "comfy",
      kind: "image",
      params: comfy,
    },
    refs,
  );

  try {
    const submitted = await apiPostWithTimeout<Record<string, unknown>>(
      "/api/canvas-comfy-tasks",
      payload,
    );
    if (typeof submitted.error === "string" && submitted.error.trim()) {
      return { error: submitted.error.trim() };
    }
    const taskId = String(submitted.task_id ?? submitted.taskId ?? "");
    if (!taskId) return { error: "ComfyUI 未返回画布任务 ID" };
    const polled = await pollLegacyUntilDone(taskId, 120, 1800, 600_000, "comfy");
    if (polled.error) return { error: polled.error };
    const urls = polled.urls?.length
      ? polled.urls
      : polled.url
        ? [polled.url]
        : [];
    if (!urls.length) return { error: "ComfyUI 未返回图片" };

    const pos = nextAppendPosition(nodes, viewport ?? { x: 0, y: 0, scale: 1 });
    const resultNodes = legacyNodesFromResultUrls(urls, pos.x, pos.y, "Comfy 结果");
    return { urls, url: urls[0], resultNodes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "ComfyUI 生成失败" };
  }
}

/** Fork-first: history `runVideoNode` → POST `/api/canvas-video`. */
export async function runVideoNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  config?: AiConfig,
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  const { prompt: wiredPrompt, refs } = collectGenerationInput(
    node,
    nodes,
    connections,
    loopCtx,
  );
  const nodePrompt = String(node.prompt ?? "").trim();
  const prompt = wiredPrompt || nodePrompt;
  if (!prompt) return { error: "视频生成需要提示词" };

  const video = readNodeVideoSettings(node, config);
  const imageRefs = refs.map((url) => ({ url, kind: "image" as const }));

  try {
    const res = await api.post<Record<string, unknown>>("/api/canvas-video", {
      prompt,
      provider_id: video.providerId,
      model: video.model,
      duration: video.duration,
      aspect_ratio: video.aspectRatio,
      resolution: video.resolution,
      images: imageRefs,
    });
    if (typeof res.error === "string" && res.error.trim()) {
      return { error: res.error.trim() };
    }
    const urls = extractGenerationUrls(res);
    if (!urls.length) return { error: "视频生成未返回结果" };

    const pos = nextAppendPosition(nodes, viewport ?? { x: 0, y: 0, scale: 1 });
    const resultNodes = legacyNodesFromResultUrls(urls, pos.x, pos.y, "视频结果").map(
      (n) => ({
        ...n,
        kind: "video",
        images: n.images.map((img) => ({ ...img, kind: "video" })),
      }),
    );
    return { urls, url: urls[0], resultNodes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "视频生成失败" };
  }
}

/** Fork-first: history `runLLMNode` → POST `/api/canvas-llm`. */
export async function runLlmNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  config?: AiConfig,
): Promise<RunNodeOutcome> {
  const wired = collectLlmInput(node, nodes, connections);
  const input = wired || String(node.prompt ?? "").trim();
  if (!input) return { error: "LLM 需要提示词输入" };

  const s = node.settings ?? {};
  const providers = chatCapableProviders(config);
  const providerId =
    String(s.llmProvider ?? s.apiProvider ?? "") || providers[0]?.id || "comfly";
  const model =
    String(s.model ?? "") || resolveChatModel(config, providerId, {}, "");

  try {
    const res = await api.post<{ text?: string; error?: string }>(
      "/api/canvas-llm",
      {
        message: input,
        model,
        ms_model: providerId === "modelscope" ? model : "",
        provider: providerId,
        system_prompt: String(s.systemPrompt ?? "You are a helpful assistant."),
      },
    );
    if (typeof res.error === "string" && res.error.trim()) {
      return { error: res.error.trim() };
    }
    const text = String(res.text ?? "").trim();
    if (!text) return { error: "LLM 未返回文本" };
    return { url: "", urls: [], outputText: text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "LLM 运行失败" };
  }
}

/** Fork-first: history `runMsGenNode` → POST `/api/ms/generate`. */
export async function runMsGenNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  const { prompt: wiredPrompt, refs } = collectGenerationInput(
    node,
    nodes,
    connections,
    loopCtx,
  );
  const nodePrompt = String(node.prompt ?? "").trim();
  const prompt = wiredPrompt || nodePrompt;
  if (!prompt) return { error: "需要提示词" };

  const s = node.settings ?? {};
  let width = Number(s.msWidth ?? s.width ?? 1024);
  let height = Number(s.msHeight ?? s.height ?? 1024);
  if (String(s.ratio ?? "") === "source" && refs[0]) {
    const size = await resolveGeneratorApiSize({
      ratio: "source",
      resolution: String(s.resolution ?? "1k"),
      customRatio: String(s.customRatio ?? ""),
      refUrls: refs,
    });
    const m = size.match(/^(\d+)x(\d+)$/i);
    if (m) {
      width = Number(m[1]);
      height = Number(m[2]);
    }
  }

  try {
    const res = await api.post<Record<string, unknown>>("/api/ms/generate", {
      prompt,
      width,
      height,
      size: `${width}x${height}`,
      image_urls: refs,
    });
    if (typeof res.error === "string" && res.error.trim()) {
      return { error: res.error.trim() };
    }
    let urls = extractGenerationUrls(res);
    const taskId = res.task_id ?? res.taskId;
    if (!urls.length && taskId) {
      const polled = await pollLegacyUntilDone(String(taskId), 60, 2000);
      if (polled.error) return { error: polled.error };
      urls = polled.urls?.length
        ? polled.urls
        : polled.url
          ? [polled.url]
          : [];
    }
    if (!urls.length) return { error: "MS 生成未返回图片" };

    const pos = nextAppendPosition(nodes, viewport ?? { x: 0, y: 0, scale: 1 });
    const resultNodes = legacyNodesFromResultUrls(urls, pos.x, pos.y, "MS 结果").map(
      (n) => ({
        ...n,
        kind: "msgen",
        images: n.images.map((img) => ({ ...img, kind: "msgen" })),
      }),
    );
    return { urls, url: urls[0], resultNodes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "MS 生成失败" };
  }
}

/** Fork-first: history `runRhNode` (minimal — workflow submit). */
export async function runRhNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  const workflowId = String(node.settings?.workflowId ?? "").trim();
  const webappId = String(node.settings?.webappId ?? "").trim();
  const mode = String(node.settings?.rhMode ?? "workflow");
  if (mode === "workflow" && !workflowId) {
    return { error: "请填写 RunningHub workflowId" };
  }
  if (mode === "app" && !webappId) {
    return { error: "请填写 RunningHub webappId" };
  }

  const { prompt: wiredPrompt, refs } = collectGenerationInput(
    node,
    nodes,
    connections,
    loopCtx,
  );
  const prompt = wiredPrompt || String(node.prompt ?? "").trim();
  const savedNodeInfo = Array.isArray(node.settings?.nodeInfoList)
    ? (node.settings.nodeInfoList as RunningHubNodeInfo[])
    : [];

  try {
    const templateNodeInfo = savedNodeInfo.length
      ? savedNodeInfo
      : await loadRunningHubNodeInfo(mode, workflowId, webappId);
    const uploadedRefs = refs.length
      ? await uploadRunningHubReferences(refs)
      : [];
    const mapped = mapRunningHubInputs(templateNodeInfo, prompt, uploadedRefs);
    if (refs.length && mapped.mappedRefs < refs.length) {
      return { error: `RunningHub 参数中只有 ${mapped.mappedRefs} 个可映射图片字段，当前连接了 ${refs.length} 张图片` };
    }
    if (prompt && templateNodeInfo.length && !mapped.mappedPrompt) {
      return { error: "RunningHub 参数中没有可映射的提示词字段" };
    }
    const endpoint =
      mode === "app" ? "/api/runninghub/submit" : "/api/runninghub/workflow-submit";
    const body =
      mode === "app"
        ? {
            webappId,
            nodeInfoList: mapped.items,
            instanceType: "",
          }
        : {
            workflowId,
            nodeInfoList: mapped.items,
          };

    const submit = await api.post<Record<string, unknown>>(endpoint, body);
    if (typeof submit.error === "string" && submit.error.trim()) {
      return { error: submit.error.trim() };
    }
    const data = (submit.data ?? submit) as Record<string, unknown>;
    const taskId = String(data.taskId ?? data.task_id ?? "");
    if (!taskId) return { error: "RunningHub 未返回 taskId" };

    let result: Record<string, unknown> | null = null;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const q = await api.get<Record<string, unknown>>(
        `/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`,
      );
      const qd = (q.data ?? q) as Record<string, unknown>;
      if (qd.status === "SUCCESS") {
        result = qd;
        break;
      }
      if (qd.status === "FAILED") {
        return { error: String(qd.failReason ?? "RunningHub 失败") };
      }
    }
    if (!result) return { error: "RunningHub 超时" };
    const urls = Array.isArray(result.urls)
      ? (result.urls as string[]).filter(Boolean)
      : extractGenerationUrls(result);
    if (!urls.length) return { error: "RunningHub 无输出" };

    const pos = nextAppendPosition(nodes, viewport ?? { x: 0, y: 0, scale: 1 });
    const resultNodes = legacyNodesFromResultUrls(urls, pos.x, pos.y, "RH 结果");
    return { urls, url: urls[0], resultNodes, prompt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "RunningHub 失败" };
  }
}

/** Fork-first: history `runLTXDirectorNode` + `ltxBuildContiguousRelay`. */
export async function runLtxDirectorNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  const { prompt: wiredPrompt } = collectGenerationInput(
    node,
    nodes,
    connections,
    loopCtx,
  );
  const globalPrompt = wiredPrompt || node.prompt || "";
  const timeline = readLtxTimeline(node);
  const hasSegPrompt = timeline.segments.some((s) => String(s.prompt ?? "").trim());
  const hasImageSeg = timeline.segments.some(
    (s) => s.type === "image" && String(s.imageB64 ?? "").trim(),
  );
  if (!globalPrompt.trim() && !hasSegPrompt && !hasImageSeg) {
    return { error: "需要提示词或至少一个图片段" };
  }
  const workflowJson = String(
    node.settings?.workflow_json ?? LTX_DIRECTOR_WORKFLOW,
  ).trim();
  if (!workflowJson) return { error: "请选择 LTX Director 工作流" };

  try {
    const availability = await api.get<{
      available?: boolean;
      reason?: string;
      missing_nodes?: string[];
      missing_models?: string[];
    }>(
      `/api/comfyui/workflow-availability?workflow=${encodeURIComponent(workflowJson)}`,
    );
    if (!availability.available) {
      const details = [
        availability.reason,
        availability.missing_nodes?.length
          ? `缺少节点：${availability.missing_nodes.join(", ")}`
          : "",
        availability.missing_models?.length
          ? `缺少模型：${availability.missing_models.join(", ")}`
          : "",
      ].filter(Boolean).join("；");
      return { error: details || `LTX 工作流不可用：${workflowJson}` };
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "无法检查 LTX 工作流可用性",
    };
  }

  const directorInputs = buildLtxDirectorComfyParams(
    node,
    nodes,
    connections,
    globalPrompt,
  );
  const payload = buildLegacyPayload(
    {
      prompt: globalPrompt || "video",
      engine: "comfy",
      kind: "video",
      params: {
        workflow_json: workflowJson,
        type: "ltx-director",
        ...directorInputs,
      },
    },
    [],
  );

  try {
    const submitted = await apiPostWithTimeout<Record<string, unknown>>(
      "/api/canvas-comfy-tasks",
      payload,
    );
    if (typeof submitted.error === "string" && submitted.error.trim()) {
      return { error: submitted.error.trim() };
    }
    const taskId = String(submitted.task_id ?? submitted.taskId ?? "");
    if (!taskId) return { error: "LTX Director 未返回画布任务 ID" };
    const polled = await pollLegacyUntilDone(taskId, 120, 1800, 600_000, "comfy");
    if (polled.error) return { error: polled.error };
    const urls = polled.urls?.length
      ? polled.urls
      : polled.url
        ? [polled.url]
        : [];
    if (!urls.length) return { error: "LTX Director 未返回视频" };
    const pos = nextAppendPosition(nodes, viewport ?? { x: 0, y: 0, scale: 1 });
    const resultNodes = legacyNodesFromResultUrls(urls, pos.x, pos.y, "LTX 视频");
    return { urls, url: urls[0], resultNodes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "LTX Director 生成失败" };
  }
}

/** Fork-first: history `runCascadeNodeByType` (non-cascade path only). */
export async function runCanvasNode(
  node: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  config?: AiConfig,
  viewport?: ViewportState,
  loopCtx?: RunLoopContext,
): Promise<RunNodeOutcome> {
  // Re-entry guard lives in LegacyCanvasPage.handleRunNode (runningNodeIds /
  // settings.running checked *before* flipping running→true). Do not reject
  // here: the page stamps running:true for UI before calling this function.
  switch (node.kind) {
    case "generator":
      return runGeneratorNode(node, nodes, connections, config, viewport, loopCtx);
    case "comfy":
      return runComfyNode(node, nodes, connections, viewport, loopCtx);
    case "video":
      return runVideoNode(node, nodes, connections, config, viewport, loopCtx);
    case "msgen":
      return runMsGenNode(node, nodes, connections, viewport, loopCtx);
    case "llm":
      return runLlmNode(node, nodes, connections, config);
    case "rh":
      return runRhNode(node, nodes, connections, viewport, loopCtx);
    case "ltxDirector":
      return runLtxDirectorNode(node, nodes, connections, viewport, loopCtx);
    default:
      return { error: `节点类型 ${node.kind} 暂不支持图内运行` };
  }
}

export function defaultSettingsForKind(
  kind: string,
  config?: AiConfig,
): Record<string, unknown> {
  if (kind === "generator") {
    const providerId = pickDefaultImageProvider(config, "");
    return {
      apiProvider: providerId,
      model: resolveImageModel(config, providerId, ""),
      ratio: "square",
      resolution: "1k",
      quality: "auto",
      count: 1,
    };
  }
  if (kind === "comfy") {
    return {
      workflow_json: "z-image-t2i.json",
      type: "zimage",
      width: 1024,
      height: 1024,
    };
  }
  if (kind === "video") {
    const providers = videoCapableProviders(config);
    const providerId = providers[0]?.id ?? "comfly";
    return {
      apiProvider: providerId,
      model: resolveVideoModel(config, providerId, "") || DEFAULT_VIDEO_MODEL,
      duration: 5,
      aspectRatio: "16:9",
      resolution: "",
    };
  }
  if (kind === "msgen") {
    return { msWidth: 1024, msHeight: 1024, count: 1 };
  }
  if (kind === "llm") {
    const providers = chatCapableProviders(config);
    const providerId = providers[0]?.id ?? "comfly";
    return {
      llmProvider: providerId,
      model: resolveChatModel(config, providerId, {}, ""),
      systemPrompt: "You are a helpful assistant.",
      outputText: "",
    };
  }
  if (kind === "rh") {
    return { rhMode: "workflow", workflowId: "", webappId: "" };
  }
  if (kind === "ltxDirector") {
    return {
      frameRate: 24,
      durationFrames: 120,
      durationSeconds: 5,
      workflow_json: LTX_DIRECTOR_WORKFLOW,
      ltxTimelineData: JSON.stringify({
        segments: [
          {
            id: "seg-1",
            start: 0,
            length: 120,
            prompt: "",
            type: "text",
          },
        ],
        audioSegments: [],
      }),
    };
  }
  if (kind === "loop") {
    return {
      count: 3,
      mode: "serial",
      showImageInput: true,
      showPrompt: true,
      loopStart: 1,
      imageBatchSize: 1,
    };
  }
  if (kind === "prompt") {
    return { text: "" };
  }
  return {};
}
