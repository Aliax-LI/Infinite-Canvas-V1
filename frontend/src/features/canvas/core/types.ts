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
  "promptGroup",
  "output",
] as const;

export type LegacyNodeKind = (typeof LEGACY_NODE_KINDS)[number];

export const LEGACY_NODE_LABELS: Record<LegacyNodeKind, string> = {
  image: "Image",
  generator: "API生成",
  msgen: "Modelscope生成",
  video: "视频生成",
  comfy: "ComfyUI",
  rh: "RH生成",
  ltxDirector: "LTX Director",
  llm: "LLM",
  prompt: "Prompt",
  loop: "循环",
  group: "分组",
  promptGroup: "Prompt 组",
  output: "Output",
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

const LEGACY_OUT_PORT_KINDS = new Set([
  "image",
  "prompt",
  "generator",
  "comfy",
  "msgen",
  "video",
  "rh",
  "ltxDirector",
  "llm",
  "loop",
  "group",
  "promptGroup",
]);

const LEGACY_IN_PORT_KINDS = new Set([
  "generator",
  "comfy",
  "msgen",
  "video",
  "rh",
  "ltxDirector",
  "llm",
  "output",
  "loop",
]);

export function legacyNodeHasOutPort(kind: string): boolean {
  return LEGACY_OUT_PORT_KINDS.has(kind);
}

export function legacyNodeHasInPort(kind: string): boolean {
  return LEGACY_IN_PORT_KINDS.has(kind);
}

export function defaultTitleForKind(kind: string): string {
  if (isLegacyNodeKind(kind)) return LEGACY_NODE_LABELS[kind];
  return kind || "节点";
}

function positiveSize(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createLegacyNode(
  partial: Partial<LegacyNode> & { kind: string },
): LegacyNode {
  return {
    id: partial.id ?? crypto.randomUUID(),
    kind: partial.kind,
    x: partial.x ?? 100,
    y: partial.y ?? 100,
    width: positiveSize(partial.width, LEGACY_NODE_W),
    // 0 / NaN must not stick — wires use height/2 and would land on the top edge.
    height: positiveSize(partial.height, LEGACY_NODE_H),
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
  const kind = String(o.kind ?? o.type ?? "image");
  let images = Array.isArray(o.images)
    ? (o.images as LegacyNodeImage[])
    : [];
  const topUrl = String(o.url ?? "");
  if (!images.length && topUrl) {
    images = [
      {
        url: topUrl,
        kind: String(o.mediaKind ?? o.media_kind ?? "image"),
        name: String(o.name ?? ""),
      },
    ];
  }
  // History stores many generator fields at the top level; fold into settings.
  const baseSettings =
    (o.settings as Record<string, unknown> | undefined) ?? {};
  const lifted: Record<string, unknown> = { ...baseSettings };
  const liftKeys = [
    "count",
    "apiProvider",
    "provider_id",
    "model",
    "ratio",
    "resolution",
    "quality",
    "customRatio",
    "customSize",
    "size",
    "msWidth",
    "msHeight",
    "workflow_json",
    "workflowId",
    "webappId",
    "rhMode",
  ] as const;
  for (const key of liftKeys) {
    if (lifted[key] == null && o[key] != null) lifted[key] = o[key];
  }
  if (lifted._pending == null && Array.isArray(o._pending)) {
    lifted._pending = o._pending;
  }
  if (lifted.outputImages == null && Array.isArray(o.outputImages)) {
    lifted.outputImages = o.outputImages;
  }
  return createLegacyNode({
    id: String(o.id ?? crypto.randomUUID()),
    kind,
    x: Number(o.x ?? 0),
    y: Number(o.y ?? 0),
    width: positiveSize(o.width ?? o.w, LEGACY_NODE_W),
    height: positiveSize(o.height ?? o.h, LEGACY_NODE_H),
    title: String(o.title ?? o.name ?? o.kind ?? o.type ?? "节点"),
    // History prompt nodes store body in `text`; React editor uses `prompt`.
    prompt: String(o.prompt ?? o.text ?? ""),
    images,
    settings: lifted,
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
