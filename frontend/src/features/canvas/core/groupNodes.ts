import type { LegacyConnection, LegacyNode } from "./types";
import { createLegacyNode, defaultTitleForKind } from "./types";

const GENERATOR_KINDS = new Set([
  "generator",
  "msgen",
  "comfy",
  "ltxDirector",
  "video",
  "rh",
  "llm",
]);

export function nodeBounds(
  ids: string[],
  nodes: LegacyNode[],
): { x: number; y: number; w: number; h: number } {
  const rects = ids
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is LegacyNode => Boolean(n))
    .map((n) => ({
      x: n.x,
      y: n.y,
      w: n.width || 280,
      h: n.height || 200,
    }));
  if (!rects.length) return { x: 0, y: 0, w: 300, h: 220 };
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function handoffConnectionsToGroup(
  group: LegacyNode,
  childIds: Set<string>,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): LegacyConnection[] {
  if (group.kind !== "group") return connections;
  const targetIds = new Set<string>();
  connections.forEach((c) => {
    if (!childIds.has(c.from)) return;
    const target = nodes.find((n) => n.id === c.to);
    if (target && GENERATOR_KINDS.has(target.kind)) targetIds.add(target.id);
  });
  if (!targetIds.size) return connections;

  let next = connections.filter(
    (c) => !(childIds.has(c.from) && targetIds.has(c.to)),
  );
  targetIds.forEach((targetId) => {
    if (next.some((c) => c.from === group.id && c.to === targetId)) return;
    next = [
      ...next,
      { id: crypto.randomUUID(), from: group.id, to: targetId },
    ];
  });
  return next;
}

/** Fork-first: history `groupSelectedImages` / prompt-only → `promptGroup`. */
export function buildGroupFromSelection(
  selectedIds: string[],
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  fallbackX = 200,
  fallbackY = 200,
): {
  group: LegacyNode;
  connections: LegacyConnection[];
} | null {
  const targets = selectedIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is LegacyNode => Boolean(n));

  const prompts = targets.filter((n) => n.kind === "prompt");
  const images = targets.filter((n) => n.kind === "image");
  const allPromptsOnly =
    prompts.length >= 2 && prompts.length === targets.length;

  let group: LegacyNode;
  if (allPromptsOnly) {
    const box = nodeBounds(
      prompts.map((n) => n.id),
      nodes,
    );
    group = createLegacyNode({
      kind: "promptGroup",
      x: box.x - 24,
      y: box.y - 58,
      width: box.w + 48,
      height: box.h + 90,
      title: "Prompts",
      settings: { items: prompts.map((n) => n.id) },
    });
    return { group, connections };
  }

  const mixTargets = targets.filter(
    (n) => n.kind === "image" || n.kind === "prompt",
  );

  if (mixTargets.length) {
    const box = nodeBounds(
      mixTargets.map((n) => n.id),
      nodes,
    );
    group = createLegacyNode({
      kind: "group",
      x: box.x - 24,
      y: box.y - 58,
      width: box.w + 48,
      height: box.h + 90,
      title: defaultTitleForKind("group"),
      settings: { items: mixTargets.map((n) => n.id) },
    });
    const childIds = new Set(mixTargets.map((n) => n.id));
    const nextConnections = handoffConnectionsToGroup(
      group,
      childIds,
      nodes,
      connections,
    );
    return { group, connections: nextConnections };
  }

  group = createLegacyNode({
    kind: "group",
    x: fallbackX,
    y: fallbackY,
    width: 300,
    height: 220,
    title: defaultTitleForKind("group"),
    settings: { items: [] },
  });
  return { group, connections };
}
