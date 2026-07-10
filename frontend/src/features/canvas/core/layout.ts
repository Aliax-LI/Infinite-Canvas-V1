import type { LegacyConnection, LegacyNode } from "./types";
import { LEGACY_NODE_H, LEGACY_NODE_W } from "./types";

export function connectionPath(
  from: LegacyNode,
  to: LegacyNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const fw = from.width ?? LEGACY_NODE_W;
  const fh = from.height ?? LEGACY_NODE_H;
  const tw = to.width ?? LEGACY_NODE_W;
  const th = to.height ?? LEGACY_NODE_H;
  return {
    x1: from.x + fw,
    y1: from.y + fh / 2,
    x2: to.x,
    y2: to.y + th / 2,
  };
}

export function filterValidConnections(
  connections: LegacyConnection[],
  nodeIds: Set<string>,
): LegacyConnection[] {
  return connections.filter((c) => nodeIds.has(c.from) && nodeIds.has(c.to));
}
