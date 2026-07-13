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
 *
 * Must use getBoundingClientRect (not offsetTop + height/2): ports use
 * `transform: translateY(-50%)`, and offset* ignores transforms — that made edges
 * land ~half a port-hit-box below the visible circular handle.
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
      const portRect = port.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      // Visual center includes CSS transforms; divide by viewport scale on the card.
      if (portRect.width > 0 || portRect.height > 0) {
        const cw =
          card.offsetWidth || cardRect.width || effectiveNodeWidth(node);
        const ch =
          card.offsetHeight || cardRect.height || effectiveNodeHeight(node);
        const scaleX = cardRect.width > 0 ? cardRect.width / cw : 1;
        const scaleY = cardRect.height > 0 ? cardRect.height / ch : 1;
        return {
          x: nx + (portRect.left + portRect.width / 2 - cardRect.left) / scaleX,
          y: ny + (portRect.top + portRect.height / 2 - cardRect.top) / scaleY,
        };
      }

      const ow = port.offsetWidth;
      const oh = port.offsetHeight;
      // jsdom / pre-layout: offset* is available but rects are 0 — no transform.
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

/** History `pathEl` cubic: horizontal handles with dx = max(80, |x2-x1|*0.45). */
export function connectionCubicPathD(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
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
