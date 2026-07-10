import {
  extractLoopSettings,
  extractMemberIds,
  extractPromptSettings,
  KIND_TO_LEGACY_TYPE,
  resolveKind,
} from "./legacyTypes";

export type EngineKind =
  | "api"
  | "volcengine"
  | "modelscope"
  | "comfy"
  | "runninghub"
  | "openai";

export const UNDO_LIMIT = 40;

export const DEFAULT_VIEWPORT = { x: 0, y: 0, scale: 1 };

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

export interface SmartNode {
  id: string;
  kind: string;
  legacyType?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  prompt: string;
  images: NodeImage[];
  settings: Record<string, unknown>;
  group_id?: string;
  member_ids?: string[];
  collapsed?: boolean;
  status?: "idle" | "running" | "done" | "error";
  scale?: number;
  created_at?: number;
}

export interface NodeImage {
  url: string;
  kind?: string;
  name?: string;
}

export interface CanvasConnection {
  id: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasDoc {
  id: string;
  title: string;
  icon: string;
  kind: string;
  nodes: SmartNode[];
  connections: CanvasConnection[];
  viewport: ViewportState;
  logs: LogEntry[];
  settings: Record<string, unknown>;
  updated_at?: number;
}

export interface LogEntry {
  id: string;
  ts: number;
  prompt: string;
  kind: string;
  url?: string;
  engine?: string;
}

export interface ComposerSettings {
  engine: EngineKind;
  prompt: string;
  kind: "image" | "video" | "text";
  params: Record<string, unknown>;
}

export function normalizeCanvasPayload(data: unknown): {
  nodes: SmartNode[];
  connections: CanvasConnection[];
} {
  if (!data || typeof data !== "object") {
    return { nodes: [], connections: [] };
  }
  const obj = data as Record<string, unknown>;
  if (Array.isArray(data)) {
    return {
      nodes: (data as SmartNode[]).map(normalizeNode),
      connections: [],
    };
  }
  if (Array.isArray(obj.nodes)) {
    return {
      nodes: (obj.nodes as unknown[]).map(normalizeNode),
      connections: Array.isArray(obj.connections)
        ? (obj.connections as CanvasConnection[])
        : [],
    };
  }
  const workflow = obj.workflow as Record<string, unknown> | undefined;
  if (workflow && Array.isArray(workflow.nodes)) {
    return {
      nodes: (workflow.nodes as unknown[]).map(normalizeNode),
      connections: Array.isArray(workflow.connections)
        ? (workflow.connections as CanvasConnection[])
        : [],
    };
  }
  return { nodes: [], connections: [] };
}

export function normalizeNode(raw: unknown): SmartNode {
  const n = (raw ?? {}) as Record<string, unknown>;

  const kind = resolveKind(n);
  const legacyType =
    n.type != null
      ? String(n.type)
      : KIND_TO_LEGACY_TYPE[kind] ?? kind;

  const w = Number(n.w ?? n.width ?? (kind === "loop" ? 340 : kind === "prompt" ? 316 : 280));
  const h = Number(n.h ?? n.height ?? (kind === "loop" ? 168 : kind === "prompt" ? 240 : 200));

  const baseSettings = (n.settings as Record<string, unknown>) ?? {};
  const mergedSettings: Record<string, unknown> = { ...baseSettings };

  if (kind === "loop") Object.assign(mergedSettings, extractLoopSettings(n));
  if (kind === "prompt") Object.assign(mergedSettings, extractPromptSettings(n));
  if (n.historyFor) mergedSettings.historyFor = n.historyFor;
  if (n.isHistoryGroup) mergedSettings.isHistoryGroup = n.isHistoryGroup;
  if (n.scale != null) mergedSettings.scale = n.scale;

  const promptText =
    kind === "prompt"
      ? String(n.text ?? n.prompt ?? "")
      : String(n.prompt ?? n.text ?? "");

  return {
    id: String(n.id ?? crypto.randomUUID()),
    kind,
    legacyType,
    x: Number(n.x ?? 0),
    y: Number(n.y ?? 0),
    width: w,
    height: h,
    title: String(n.title ?? defaultTitle(kind)),
    prompt: promptText,
    images: Array.isArray(n.images) ? (n.images as SmartNode["images"]) : [],
    settings: mergedSettings,
    group_id: n.group_id != null ? String(n.group_id) : undefined,
    member_ids: extractMemberIds(n),
    collapsed: Boolean(n.collapsed),
    status: (n.status as SmartNode["status"]) ?? "idle",
    scale: n.scale != null ? Number(n.scale) : undefined,
    created_at: n.created_at != null ? Number(n.created_at) : undefined,
  };
}

function defaultTitle(kind: string): string {
  switch (kind) {
    case "prompt":
      return "Prompt";
    case "loop":
      return "Loop";
    case "group":
      return "智能分组";
    case "export":
      return "导出";
    default:
      return "新节点";
  }
}

export function createNode(
  partial: Partial<SmartNode> & { kind: string },
): SmartNode {
  return normalizeNode({
    id: partial.id ?? crypto.randomUUID(),
    x: partial.x ?? 100,
    y: partial.y ?? 100,
    width: partial.width ?? 280,
    height: partial.height ?? 200,
    title: partial.title ?? "新节点",
    prompt: partial.prompt ?? "",
    images: partial.images ?? [],
    settings: partial.settings ?? {},
    kind: partial.kind,
    group_id: partial.group_id,
    status: "idle",
  });
}
