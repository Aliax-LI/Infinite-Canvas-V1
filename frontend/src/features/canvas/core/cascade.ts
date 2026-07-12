import type { LegacyConnection, LegacyNode } from "./types";

/** Fork-first from history `canvasRunTypes`. */
export const CANVAS_RUN_KINDS = [
  "generator",
  "msgen",
  "comfy",
  "ltxDirector",
  "llm",
  "video",
  "rh",
] as const;

export type CanvasRunKind = (typeof CANVAS_RUN_KINDS)[number];

export function isCanvasRunKind(kind: string): kind is CanvasRunKind {
  return (CANVAS_RUN_KINDS as readonly string[]).includes(kind);
}

function upstreamGenIds(
  nodeId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    connections
      .filter((c) => c.to === id)
      .forEach((c) => {
        if (seen.has(c.from)) return;
        seen.add(c.from);
        const from = nodes.find((n) => n.id === c.from);
        if (!from) return;
        if (isCanvasRunKind(from.kind)) {
          walk(from.id);
          found.push(from.id);
        } else if (from.kind === "output") {
          connections
            .filter((cc) => cc.to === from.id)
            .forEach((cc) => {
              const ff = nodes.find((n) => n.id === cc.from);
              if (ff && isCanvasRunKind(ff.kind)) walk(ff.id);
            });
        }
      });
  };
  walk(nodeId);
  return found;
}

/** Fork-first from history `computeCascadeOrder`. */
export function computeCascadeOrder(
  targetId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    connections
      .filter((c) => c.to === id)
      .forEach((c) => {
        const from = nodes.find((n) => n.id === c.from);
        if (!from) return;
        if (isCanvasRunKind(from.kind)) {
          dfs(from.id);
        } else if (from.kind === "output") {
          connections
            .filter((cc) => cc.to === from.id)
            .forEach((cc) => {
              const ff = nodes.find((n) => n.id === cc.from);
              if (ff && isCanvasRunKind(ff.kind)) dfs(ff.id);
            });
        }
      });
    if (isCanvasRunKind(node.kind)) order.push(id);
  }

  dfs(targetId);
  return order;
}

/** Fork-first from history `isTerminalGenerator`. */
export function isTerminalGenerator(
  nodeId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): boolean {
  for (const c of connections.filter((conn) => conn.from === nodeId)) {
    const target = nodes.find((n) => n.id === c.to);
    if (!target) continue;
    if (isCanvasRunKind(target.kind)) return false;
    if (target.kind === "output") {
      for (const c2 of connections.filter((cc) => cc.from === target.id)) {
        const t2 = nodes.find((n) => n.id === c2.to);
        if (t2 && isCanvasRunKind(t2.kind)) return false;
      }
    }
  }
  return true;
}

export function shouldShowCascadeButton(
  nodeId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): boolean {
  if (!isTerminalGenerator(nodeId, nodes, connections)) return false;
  const order = computeCascadeOrder(nodeId, nodes, connections);
  return order.length > 1;
}

export function upstreamNodeIds(
  targetId: string,
  connections: LegacyConnection[],
): Set<string> {
  const found = new Set<string>();
  const walk = (id: string) => {
    connections
      .filter((c) => c.to === id)
      .forEach((c) => {
        if (found.has(c.from)) return;
        found.add(c.from);
        walk(c.from);
      });
  };
  walk(targetId);
  return found;
}
