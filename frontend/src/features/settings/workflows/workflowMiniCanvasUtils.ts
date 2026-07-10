import { fieldKind, type PreviewValues, type WorkflowField } from "./workflowFieldUtils";

export type MiniNodeType = "prompt" | "image" | "video" | "audio" | "comfy" | "output";

export interface MiniTestNode {
  id: string;
  type: MiniNodeType;
  x: number;
  y: number;
  text?: string;
  url?: string;
  value?: string;
  name?: string;
  userAdded?: boolean;
}

export interface MiniView {
  x: number;
  y: number;
  k: number;
}

export type MiniCardPositions = Record<string, { x: number; y: number }>;

export const MINI_CARD_W = 230;
export const MINI_COMFY_W = 270;

const MEDIA_KINDS = ["image", "video", "audio"] as const;

export function defaultMiniTestNodes(): MiniTestNode[] {
  return [
    { id: "comfy_1", type: "comfy", x: 330, y: 150 },
    { id: "output_1", type: "output", x: 670, y: 190 },
  ];
}

export function buildMiniNodesFromFields(
  fields: WorkflowField[],
  previewValues: PreviewValues,
  positions: MiniCardPositions = {},
): MiniTestNode[] {
  const promptFields = fields.filter((f) => fieldKind(f) === "prompt");
  const nodes: MiniTestNode[] = [];
  const pos = (id: string, fallback: { x: number; y: number }) => positions[id] ?? fallback;

  if (promptFields.length > 0) {
    const text = promptFields
      .map((f) => String(previewValues[f.id] ?? f.default ?? ""))
      .filter(Boolean)
      .join("\n\n");
    const p = pos("prompt_1", { x: 36, y: 96 });
    nodes.push({ id: "prompt_1", type: "prompt", x: p.x, y: p.y, text });
  }

  for (const kind of MEDIA_KINDS) {
    const mediaFields = fields.filter((f) => fieldKind(f) === kind);
    mediaFields.forEach((f, i) => {
      const id = `${kind}_${i + 1}`;
      const p = pos(id, { x: 36, y: 286 + i * 170 });
      const value = String(previewValues[f.id] ?? f.default ?? "");
      nodes.push({ id, type: kind, x: p.x, y: p.y, url: "", value, name: value });
    });
  }

  const comfy = pos("comfy_1", { x: 330, y: 150 });
  nodes.push({ id: "comfy_1", type: "comfy", x: comfy.x, y: comfy.y });
  const out = pos("output_1", { x: 670, y: 190 });
  nodes.push({ id: "output_1", type: "output", x: out.x, y: out.y });

  return nodes;
}

export function syncMiniNodesForFields(
  fields: WorkflowField[],
  previewValues: PreviewValues,
  positions: MiniCardPositions = {},
  previous: MiniTestNode[] = [],
): MiniTestNode[] {
  const mergedPositions = { ...miniNodesToPositions(previous), ...positions };
  const built = buildMiniNodesFromFields(fields, previewValues, mergedPositions);
  const builtIds = new Set(built.map((n) => n.id));

  for (const node of built) {
    const prev = previous.find((n) => n.id === node.id);
    if (!prev) continue;
    node.x = prev.x;
    node.y = prev.y;
    if (node.type === "prompt" && prev.text) {
      node.text = prev.text;
    }
    if (MEDIA_KINDS.includes(node.type as (typeof MEDIA_KINDS)[number])) {
      node.url = prev.url ?? node.url;
      node.value = prev.value ?? node.value;
      node.name = prev.name ?? node.name;
    }
  }

  const extras = previous.filter(
    (n) => n.userAdded && !builtIds.has(n.id) && n.type !== "comfy" && n.type !== "output",
  );

  const inputs = built.filter((n) => n.type !== "comfy" && n.type !== "output");
  const comfy = built.find((n) => n.type === "comfy")!;
  const output = built.find((n) => n.type === "output")!;
  return [...inputs, ...extras, comfy, output];
}

export function applyMiniCardPositions(
  nodes: MiniTestNode[],
  positions: MiniCardPositions | undefined,
): MiniTestNode[] {
  if (!positions) return nodes;
  return nodes.map((node) => {
    const pos = positions[node.id];
    return pos ? { ...node, x: pos.x, y: pos.y } : node;
  });
}

export function miniNodesToPositions(nodes: MiniTestNode[]): MiniCardPositions {
  const out: MiniCardPositions = {};
  for (const node of nodes) {
    out[node.id] = { x: node.x, y: node.y };
  }
  return out;
}

export function lineBetween(a: { x: number; y: number }, b: { x: number; y: number }, cardW = MINI_CARD_W) {
  const x1 = a.x + cardW;
  const y1 = a.y + 72;
  const x2 = b.x;
  const y2 = b.y + 72;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x1, y1, len, deg };
}

export function fieldsFromMiniCanvas(
  previewValues: PreviewValues,
  fields: WorkflowField[],
  nodes: MiniTestNode[],
): PreviewValues {
  const next: PreviewValues = { ...previewValues };
  const promptFields = fields.filter((f) => fieldKind(f) === "prompt");
  const prompt = nodes
    .filter((n) => n.type === "prompt")
    .map((n) => n.text || "")
    .filter(Boolean)
    .join("\n\n");

  for (const kind of MEDIA_KINDS) {
    const mediaFields = fields.filter((f) => fieldKind(f) === kind);
    const mediaNodes = nodes.filter((n) => n.type === kind && n.value);
    mediaFields.forEach((f, i) => {
      next[f.id] = mediaNodes[i]?.value || next[f.id] || "";
    });
  }

  for (const f of promptFields) {
    next[f.id] = prompt || next[f.id] || "";
  }

  return next;
}

export function createMiniNode(
  type: "prompt" | "image" | "video" | "audio",
  nodes: MiniTestNode[],
): MiniTestNode {
  const count = nodes.filter((n) => n.type === type).length;
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type,
    x: 42 + count * 26,
    y: type === "prompt" ? 86 + count * 170 : 286 + count * 170,
    text: "",
    url: "",
    value: "",
    userAdded: true,
  };
}

export function countFieldsByKind(fields: WorkflowField[]) {
  return {
    prompt: fields.filter((f) => fieldKind(f) === "prompt").length,
    image: fields.filter((f) => fieldKind(f) === "image").length,
    video: fields.filter((f) => fieldKind(f) === "video").length,
    audio: fields.filter((f) => fieldKind(f) === "audio").length,
    setting: fields.filter((f) => fieldKind(f) === "setting").length,
  };
}
