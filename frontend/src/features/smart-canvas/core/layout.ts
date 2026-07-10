import type { SmartNode, ViewportState } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeNodeBounds(nodes: SmartNode[]): Bounds | null {
  if (!nodes.length) return null;
  return nodes.reduce(
    (acc, node) => {
      const w = node.width ?? 280;
      const h = node.height ?? 200;
      return {
        minX: Math.min(acc.minX, node.x),
        minY: Math.min(acc.minY, node.y),
        maxX: Math.max(acc.maxX, node.x + w),
        maxY: Math.max(acc.maxY, node.y + h),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export function fitViewportToBounds(
  bounds: Bounds,
  containerWidth: number,
  containerHeight: number,
  padding = 80,
): ViewportState {
  const contentW = bounds.maxX - bounds.minX + padding * 2;
  const contentH = bounds.maxY - bounds.minY + padding * 2;
  const scale = Math.min(
    containerWidth / contentW,
    containerHeight / contentH,
    1,
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: containerWidth / 2 - cx * scale,
    y: containerHeight / 2 - cy * scale,
  };
}

export function autoArrangeNodes(nodes: SmartNode[], cols = 3): SmartNode[] {
  const gap = 40;
  const colW = 320;
  const rowH = 240;
  return nodes.map((node, i) => ({
    ...node,
    x: (i % cols) * (colW + gap),
    y: Math.floor(i / cols) * (rowH + gap),
  }));
}

export function isNodeVisible(
  node: SmartNode,
  viewport: ViewportState,
  containerWidth: number,
  containerHeight: number,
  buffer = 200,
): boolean {
  const left = viewport.x + node.x * viewport.scale;
  const top = viewport.y + node.y * viewport.scale;
  const w = (node.width ?? 280) * viewport.scale;
  const h = (node.height ?? 200) * viewport.scale;
  return !(
    left + w < -buffer ||
    top + h < -buffer ||
    left > containerWidth + buffer ||
    top > containerHeight + buffer
  );
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

export function getGroupMembers(
  group: SmartNode,
  nodes: SmartNode[],
): SmartNode[] {
  const ids = new Set(group.member_ids ?? []);
  if (group.group_id) ids.add(group.group_id);
  return nodes.filter(
    (n) => ids.has(n.id) || n.group_id === group.id,
  );
}

export function smartGroupLayout(
  group: SmartNode,
  members: SmartNode[],
  padding = 24,
  gap = 16,
): { group: SmartNode; members: SmartNode[] } {
  if (!members.length) return { group, members };
  const cols = Math.ceil(Math.sqrt(members.length));
  const cellW = 280;
  const cellH = 200;
  const arranged = members.map((m, i) => ({
    ...m,
    x: group.x + padding + (i % cols) * (cellW + gap),
    y: group.y + padding + 40 + Math.floor(i / cols) * (cellH + gap),
  }));
  const bounds = computeNodeBounds(arranged)!;
  const groupW = bounds.maxX - bounds.minX + padding;
  const groupH = bounds.maxY - bounds.minY + padding + 40;
  return {
    group: { ...group, width: groupW, height: groupH },
    members: arranged,
  };
}

export function connectionPath(
  from: SmartNode,
  to: SmartNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = from.x + (from.width ?? 280) / 2;
  const y1 = from.y + (from.height ?? 200) / 2;
  const x2 = to.x + (to.width ?? 280) / 2;
  const y2 = to.y + (to.height ?? 200) / 2;
  return { x1, y1, x2, y2 };
}
