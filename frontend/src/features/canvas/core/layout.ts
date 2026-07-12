import { canConnect } from "./connectRules";
import type { LegacyConnection, LegacyNode } from "./types";
import { LEGACY_NODE_H, LEGACY_NODE_W } from "./types";

/** Positive finite size, else legacy default (history `n.h || 200` pattern). */
export function effectiveNodeWidth(node: LegacyNode): number {
  const w = Number(node.width);
  return Number.isFinite(w) && w > 0 ? w : LEGACY_NODE_W;
}

export function effectiveNodeHeight(node: LegacyNode): number {
  const h = Number(node.height);
  return Number.isFinite(h) && h > 0 ? h : LEGACY_NODE_H;
}

export function nodeOutPort(node: LegacyNode): { x: number; y: number } {
  const fw = effectiveNodeWidth(node);
  const fh = effectiveNodeHeight(node);
  return { x: node.x + fw, y: node.y + fh / 2 };
}

export function nodeInPort(node: LegacyNode): { x: number; y: number } {
  const fh = effectiveNodeHeight(node);
  return { x: node.x, y: node.y + fh / 2 };
}

/**
 * History `portPoint`: prefer live port DOM center (world space via card left/top),
 * then card offset size, then stored geometry. Keeps wires on ports for adaptive /
 * content-sized generator cards and during dragLivePositions (style.left/top).
 */
export function resolvePortPoint(
  node: LegacyNode,
  kind: "in" | "out",
): { x: number; y: number } {
  if (typeof document !== "undefined") {
    const card = document.querySelector(
      `[data-testid="legacy-node-${node.id}"]`,
    ) as HTMLElement | null;
    const port = card?.querySelector(
      `[data-testid="legacy-port-${kind}-${node.id}"]`,
    ) as HTMLElement | null;

    const left = card ? parseFloat(card.style.left) : NaN;
    const top = card ? parseFloat(card.style.top) : NaN;
    const nx = Number.isFinite(left) ? left : node.x;
    const ny = Number.isFinite(top) ? top : node.y;

    if (card && port) {
      const ow = port.offsetWidth;
      const oh = port.offsetHeight;
      // offset* is 0 in some test envs before layout — fall through to geometry.
      if (ow > 0 || oh > 0 || port.offsetTop !== 0 || port.offsetLeft !== 0) {
        return {
          x: nx + port.offsetLeft + ow / 2,
          y: ny + port.offsetTop + oh / 2,
        };
      }
    }

    if (card) {
      const w = card.offsetWidth || effectiveNodeWidth(node);
      const h = card.offsetHeight || effectiveNodeHeight(node);
      return kind === "out"
        ? { x: nx + w, y: ny + h / 2 }
        : { x: nx, y: ny + h / 2 };
    }
  }

  return kind === "out" ? nodeOutPort(node) : nodeInPort(node);
}

export function connectionPath(
  from: LegacyNode,
  to: LegacyNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const a = nodeOutPort(from);
  const b = nodeInPort(to);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** Connection segment using live DOM ports when available (history renderLinks). */
export function connectionPathResolved(
  from: LegacyNode,
  to: LegacyNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const a = resolvePortPoint(from, "out");
  const b = resolvePortPoint(to, "in");
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function filterValidConnections(
  connections: LegacyConnection[],
  nodeIds: Set<string>,
  nodes?: LegacyNode[],
): LegacyConnection[] {
  return connections.filter((c) => {
    if (!nodeIds.has(c.from) || !nodeIds.has(c.to)) return false;
    if (!nodes) return true;
    return canConnect(c.from, c.to, nodes, connections);
  });
}
