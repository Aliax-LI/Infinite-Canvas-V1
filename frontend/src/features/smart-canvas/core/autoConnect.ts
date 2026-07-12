import type { SmartNode } from "./types";
import { canAutoConnectNodes } from "./legacyTypes";

/** History `rectOverlapNode` — center of dragged rect hits another node's box. */
export function findOverlapNode(
  draggedId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  nodes: SmartNode[],
  excludeIds: string[] = [],
): SmartNode | null {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const excluded = new Set([draggedId, ...excludeIds]);
  for (const n of nodes) {
    if (excluded.has(n.id)) continue;
    const nw = n.width ?? 280;
    const nh = n.height ?? 200;
    if (cx >= n.x && cx <= n.x + nw && cy >= n.y && cy <= n.y + nh) {
      return n;
    }
  }
  return null;
}

/**
 * History `dragConnectTargetFor` + Ctrl-drag auto-connect.
 * Loop / prompt use cursor point; image cards use full rect overlap.
 */
export function findAutoConnectTarget(
  source: SmartNode,
  nodes: SmartNode[],
  pointerWorld?: { x: number; y: number },
): SmartNode | null {
  if (source.kind === "loop" || source.kind === "prompt") {
    if (!pointerWorld) return null;
    return findOverlapNode(
      source.id,
      pointerWorld.x - 1,
      pointerWorld.y - 1,
      2,
      2,
      nodes,
    );
  }
  return findOverlapNode(
    source.id,
    source.x,
    source.y,
    source.width ?? 280,
    source.height ?? 200,
    nodes,
  );
}

export interface AutoSnapResult {
  connected: boolean;
  targetId?: string;
  /** History restores dragged node to origin after snap connect. */
  restorePosition: boolean;
}

/**
 * On Ctrl/Meta drag end: if source overlaps a compatible target, connect.
 * Loop → nearest image card is the primary UX ("Loop auto-snap").
 */
export function resolveCtrlDragAutoSnap(
  source: SmartNode,
  nodes: SmartNode[],
  ctrlHeld: boolean,
  pointerWorld?: { x: number; y: number },
): AutoSnapResult {
  if (!ctrlHeld) return { connected: false, restorePosition: false };
  const target = findAutoConnectTarget(source, nodes, pointerWorld);
  if (!target || !canAutoConnectNodes(source, target)) {
    return { connected: false, restorePosition: false };
  }
  return {
    connected: true,
    targetId: target.id,
    restorePosition: source.kind === "loop" || source.kind === "prompt",
  };
}
