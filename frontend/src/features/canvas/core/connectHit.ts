/**
 * Fork-first from history/static/js/canvas.js `nearestPort`.
 * Uses elementFromPoint + snap radius so pointer-capture on the origin port
 * does not force e.target to stay on the source node.
 */
import { canConnect } from "./connectRules";
import { resolvePortPoint } from "./layout";
import type { LegacyConnection, LegacyNode } from "./types";

export const PORT_SNAP_PX = 56;

export interface ConnectSnapTarget {
  nodeId: string;
  portKind: "in" | "out";
  /** World-space port center for magnetic wire endpoint. */
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
  distance: number;
}

export function nearestPortElement(
  clientX: number,
  clientY: number,
  kind: "in" | "out",
  maxDistance = PORT_SNAP_PX,
): HTMLElement | null {
  const selector = `[data-testid^="legacy-port-${kind}-"]`;
  const under = document.elementFromPoint(clientX, clientY);
  const direct = under?.closest?.(selector) as HTMLElement | null;
  if (direct) return direct;

  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  document.querySelectorAll(selector).forEach((port) => {
    const el = port as HTMLElement;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(clientX - cx, clientY - cy);
    if (d < bestDistance) {
      bestDistance = d;
      best = el;
    }
  });
  return bestDistance <= maxDistance ? best : null;
}

export function nodeIdFromPortElement(
  port: HTMLElement,
  kind: "in" | "out",
): string {
  const testId = port.getAttribute("data-testid") ?? "";
  return testId.replace(`legacy-port-${kind}-`, "");
}

/**
 * Nearest *valid* connect target within snap radius (magnetic UX).
 * Filters with canConnect so invalid ports never highlight/snap.
 */
export function resolveConnectSnapTarget(
  clientX: number,
  clientY: number,
  originId: string,
  originKind: "in" | "out",
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  maxDistance = PORT_SNAP_PX,
): ConnectSnapTarget | null {
  const targetKind: "in" | "out" = originKind === "out" ? "in" : "out";
  const selector = `[data-testid^="legacy-port-${targetKind}-"]`;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  let best: ConnectSnapTarget | null = null;

  document.querySelectorAll(selector).forEach((port) => {
    const el = port as HTMLElement;
    const targetId = nodeIdFromPortElement(el, targetKind);
    if (!targetId || targetId === originId) return;
    const target = nodeMap.get(targetId);
    if (!target) return;

    const actualFrom = originKind === "out" ? originId : targetId;
    const actualTo = originKind === "out" ? targetId : originId;
    if (!canConnect(actualFrom, actualTo, nodes, connections)) return;

    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(clientX - cx, clientY - cy);
    if (d > maxDistance) return;
    if (best && d >= best.distance) return;

    const world = resolvePortPoint(target, targetKind);
    best = {
      nodeId: targetId,
      portKind: targetKind,
      worldX: world.x,
      worldY: world.y,
      clientX: cx,
      clientY: cy,
      distance: d,
    };
  });

  return best;
}

/** Resolve drop target node id for a port-drag release (history startLink mouseup). */
export function resolveConnectDropTarget(
  clientX: number,
  clientY: number,
  originId: string,
  originKind: "in" | "out",
  nodes?: LegacyNode[],
  connections?: LegacyConnection[],
): string | null {
  if (nodes && connections) {
    const snap = resolveConnectSnapTarget(
      clientX,
      clientY,
      originId,
      originKind,
      nodes,
      connections,
    );
    return snap?.nodeId ?? null;
  }
  const targetKind = originKind === "out" ? "in" : "out";
  const port = nearestPortElement(clientX, clientY, targetKind);
  if (!port) return null;
  const targetId = nodeIdFromPortElement(port, targetKind);
  if (!targetId || targetId === originId) return null;
  return targetId;
}
