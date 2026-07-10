import { clamp } from "../../../shared/utils";
import type { LegacyNode, ViewportState } from "./types";
import { LEGACY_NODE_H, LEGACY_NODE_W, MAX_SCALE, MIN_SCALE } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeBounds(nodes: LegacyNode[]): Bounds | null {
  if (!nodes.length) return null;
  return nodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.x),
      minY: Math.min(acc.minY, node.y),
      maxX: Math.max(acc.maxX, node.x + (node.width ?? LEGACY_NODE_W)),
      maxY: Math.max(acc.maxY, node.y + (node.height ?? LEGACY_NODE_H)),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export function fitViewportToNodes(
  nodes: LegacyNode[],
  width: number,
  height: number,
  padding = 80,
): ViewportState {
  const bounds = computeBounds(nodes);
  if (!bounds) return { x: 0, y: 0, scale: 1 };
  const contentW = bounds.maxX - bounds.minX + padding * 2;
  const contentH = bounds.maxY - bounds.minY + padding * 2;
  const scale = Math.min(width / contentW, height / contentH, 1);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: width / 2 - cx * scale,
    y: height / 2 - cy * scale,
  };
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: ViewportState,
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - viewport.x) / viewport.scale,
    y: (clientY - rect.top - viewport.y) / viewport.scale,
  };
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

export function panViewport(
  viewport: ViewportState,
  dx: number,
  dy: number,
): ViewportState {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

export function zoomViewport(
  viewport: ViewportState,
  delta: number,
): ViewportState {
  return { ...viewport, scale: clampScale(viewport.scale + delta) };
}

export function arrangeGrid(nodes: LegacyNode[], cols = 3): LegacyNode[] {
  const gap = 40;
  const colW = 320;
  const rowH = 240;
  return nodes.map((node, i) => ({
    ...node,
    x: (i % cols) * (colW + gap),
    y: Math.floor(i / cols) * (rowH + gap),
  }));
}
