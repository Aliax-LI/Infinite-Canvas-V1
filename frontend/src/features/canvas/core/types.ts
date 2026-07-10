export const DEFAULT_VIEWPORT = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;
export const LEGACY_NODE_W = 280;
export const LEGACY_NODE_H = 200;

export const LEGACY_NODE_KINDS = [
  "image",
  "generator",
  "msgen",
  "video",
  "comfy",
  "rh",
  "ltxDirector",
  "llm",
  "prompt",
  "loop",
  "group",
  "output",
] as const;

export type LegacyNodeKind = (typeof LEGACY_NODE_KINDS)[number];

export const LEGACY_NODE_LABELS: Record<LegacyNodeKind, string> = {
  image: "图片",
  generator: "生成器",
  msgen: "MS 生成",
  video: "视频",
  comfy: "ComfyUI",
  rh: "RunningHub",
  ltxDirector: "LTX 导演",
  llm: "LLM",
  prompt: "Prompt",
  loop: "循环",
  group: "分组",
  output: "输出",
};

export interface LegacyNodeImage {
  url: string;
  kind?: string;
  name?: string;
}

export interface LegacyNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  prompt: string;
  images: LegacyNodeImage[];
  settings: Record<string, unknown>;
}

export interface LegacyConnection {
  id: string;
  from: string;
  to: string;
}

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface LegacyCanvasDoc {
  id: string;
  title: string;
  nodes: LegacyNode[];
  connections?: LegacyConnection[];
  viewport: ViewportState;
  settings: Record<string, unknown>;
  updated_at?: number;
}

export interface GeneratePanelSettings {
  prompt: string;
  engine: string;
  kind: "image" | "video";
  params: Record<string, unknown>;
}

export function isLegacyNodeKind(kind: string): kind is LegacyNodeKind {
  return (LEGACY_NODE_KINDS as readonly string[]).includes(kind);
}

export function defaultTitleForKind(kind: string): string {
  if (isLegacyNodeKind(kind)) return LEGACY_NODE_LABELS[kind];
  return kind || "节点";
}

export function createLegacyNode(
  partial: Partial<LegacyNode> & { kind: string },
): LegacyNode {
  return {
    id: partial.id ?? crypto.randomUUID(),
    kind: partial.kind,
    x: partial.x ?? 100,
    y: partial.y ?? 100,
    width: partial.width ?? LEGACY_NODE_W,
    height: partial.height ?? LEGACY_NODE_H,
    title: partial.title ?? defaultTitleForKind(partial.kind),
    prompt: partial.prompt ?? "",
    images: partial.images ?? [],
    settings: partial.settings ?? {},
  };
}

export function normalizeLegacyNode(raw: unknown): LegacyNode {
  if (!raw || typeof raw !== "object") {
    return createLegacyNode({ kind: "image" });
  }
  const o = raw as Record<string, unknown>;
  const images = Array.isArray(o.images)
    ? (o.images as LegacyNodeImage[])
    : [];
  return createLegacyNode({
    id: String(o.id ?? crypto.randomUUID()),
    kind: String(o.kind ?? "image"),
    x: Number(o.x ?? 0),
    y: Number(o.y ?? 0),
    width: Number(o.width ?? LEGACY_NODE_W),
    height: Number(o.height ?? LEGACY_NODE_H),
    title: String(o.title ?? o.kind ?? "节点"),
    prompt: String(o.prompt ?? ""),
    images,
    settings: (o.settings as Record<string, unknown>) ?? {},
  });
}

export function normalizeLegacyNodes(raw: unknown): LegacyNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLegacyNode);
}

export function normalizeLegacyConnection(raw: unknown): LegacyConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const from = String(o.from ?? "");
  const to = String(o.to ?? "");
  if (!from || !to) return null;
  return {
    id: String(o.id ?? crypto.randomUUID()),
    from,
    to,
  };
}

export function normalizeLegacyConnections(raw: unknown): LegacyConnection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeLegacyConnection)
    .filter((c): c is LegacyConnection => c !== null);
}
