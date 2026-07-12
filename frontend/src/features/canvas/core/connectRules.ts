import type { LegacyConnection, LegacyNode } from "./types";

/** Fork-first: history `CANVAS_GENERATOR_TYPES`. */
export const CANVAS_GENERATOR_KINDS = [
  "generator",
  "msgen",
  "comfy",
  "ltxDirector",
  "video",
  "rh",
] as const;

/** Fork-first: history `CANVAS_MEDIA_OUTPUT_TYPES` (same set). */
export const CANVAS_MEDIA_OUTPUT_KINDS = CANVAS_GENERATOR_KINDS;

const GENERATOR_SET = new Set<string>(CANVAS_GENERATOR_KINDS);
const MEDIA_SET = new Set<string>(CANVAS_MEDIA_OUTPUT_KINDS);

const INPUT_TO_GENERATOR = new Set([
  "image",
  "prompt",
  "loop",
  "group",
  "promptGroup",
  "output",
  "llm",
]);

const LLM_INPUTS = new Set([
  "prompt",
  "loop",
  "promptGroup",
  "llm",
  "image",
  "group",
  "output",
]);

const LOOP_IMAGE_SOURCES = new Set(["image", "group", "output"]);
const LOOP_PROMPT_SOURCES = new Set(["prompt", "promptGroup", "loop", "llm"]);

export function isCanvasGeneratorKind(kind: string): boolean {
  return GENERATOR_SET.has(kind);
}

export function isCanvasMediaOutputKind(kind: string): boolean {
  return MEDIA_SET.has(kind);
}

function loopAllowsImage(node: LegacyNode): boolean {
  const s = node.settings ?? {};
  return Boolean(s.imageInput || s.showImageInput);
}

function loopAllowsPrompt(node: LegacyNode): boolean {
  return Boolean(node.settings?.showPrompt);
}

/**
 * Fork-first: history `wouldCreateGeneratorCycle`.
 * Walks forward from `toId`; returns true if path reaches `fromId` via generators/outputs.
 */
export function wouldCreateGeneratorCycle(
  fromId: string,
  toId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): boolean {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (id === fromId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    for (const c of connections.filter((x) => x.from === id)) {
      if (walk(c.to)) return true;
      const next = nodeMap.get(c.to);
      if (next?.kind === "output") {
        for (const cc of connections.filter((x) => x.from === next.id)) {
          if (walk(cc.to)) return true;
        }
      }
    }
    return false;
  };
  return walk(toId);
}

export type ConnectRejectCode =
  | "missing"
  | "self"
  | "unknown_node"
  | "generator_target"
  | "cycle"
  | "loop_ports"
  | "llm_inputs"
  | "llm_outputs"
  | "need_generator"
  | "bad_source";

export function connectRejectCode(
  fromId: string,
  toId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): ConnectRejectCode | null {
  if (!fromId || !toId) return "missing";
  if (fromId === toId) return "self";
  const from = nodes.find((n) => n.id === fromId);
  const to = nodes.find((n) => n.id === toId);
  if (!from || !to) return "unknown_node";

  if (GENERATOR_SET.has(from.kind)) {
    if (to.kind === "output") return null;
    if (MEDIA_SET.has(from.kind) && GENERATOR_SET.has(to.kind)) {
      return wouldCreateGeneratorCycle(fromId, toId, nodes, connections)
        ? "cycle"
        : null;
    }
    return "generator_target";
  }

  if (to.kind === "loop") {
    const allowImage = loopAllowsImage(to) && LOOP_IMAGE_SOURCES.has(from.kind);
    const allowPrompt =
      loopAllowsPrompt(to) && LOOP_PROMPT_SOURCES.has(from.kind);
    return allowImage || allowPrompt ? null : "loop_ports";
  }

  if (to.kind === "llm") {
    return LLM_INPUTS.has(from.kind) ? null : "llm_inputs";
  }

  if (from.kind === "llm") {
    return GENERATOR_SET.has(to.kind) ? null : "llm_outputs";
  }

  if (!GENERATOR_SET.has(to.kind)) return "need_generator";
  if (!INPUT_TO_GENERATOR.has(from.kind)) return "bad_source";
  return null;
}

/** Fork-first: history `canConnect`. */
export function canConnect(
  fromId: string,
  toId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): boolean {
  return connectRejectCode(fromId, toId, nodes, connections) === null;
}

const REJECT_MESSAGES_ZH: Record<ConnectRejectCode, string> = {
  missing: "无法连接：缺少节点",
  self: "无法连接节点到自身",
  unknown_node: "无法连接：节点不存在",
  generator_target: "生成节点只能连到输出节点，或下游生成节点",
  cycle: "无法连接：会形成生成器环路",
  loop_ports: "循环节点未开启对应输入，或源类型不匹配",
  llm_inputs: "该节点类型不能连接到 LLM",
  llm_outputs: "LLM 只能连接到生成类节点",
  need_generator: "只能连接到生成器 / Comfy / 视频等生成节点",
  bad_source: "该节点类型不能作为此连接的起点",
};

export function connectRejectMessage(
  fromId: string,
  toId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): string | null {
  const code = connectRejectCode(fromId, toId, nodes, connections);
  return code ? REJECT_MESSAGES_ZH[code] : null;
}

/** Allowed directed pairs (summary for docs / tests). */
export const CONNECT_RULES_SUMMARY = [
  "image|prompt|loop|group|promptGroup|output|llm → generator|msgen|comfy|ltxDirector|video|rh",
  "generator|msgen|comfy|ltxDirector|video|rh → output",
  "generator|msgen|comfy|ltxDirector|video|rh → generator|… (no cycle)",
  "prompt|loop|promptGroup|llm|image|group|output → llm",
  "llm → generator|msgen|comfy|ltxDirector|video|rh",
  "image|group|output → loop (when imageInput/showImageInput)",
  "prompt|promptGroup|loop|llm → loop (when showPrompt)",
] as const;

/** Drop invalid links (fork-first: history `sanitizeConnections`). */
export function sanitizeConnections(
  connections: LegacyConnection[],
  nodes: LegacyNode[],
): LegacyConnection[] {
  const ids = new Set(nodes.map((n) => n.id));
  return connections.filter(
    (c) =>
      ids.has(c.from) &&
      ids.has(c.to) &&
      canConnect(c.from, c.to, nodes, connections),
  );
}
