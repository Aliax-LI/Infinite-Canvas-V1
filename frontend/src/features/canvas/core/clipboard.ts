import type { LegacyConnection, LegacyNode } from "./types";
import { createLegacyNode } from "./types";

export interface NodeClipboard {
  nodes: LegacyNode[];
  connections: LegacyConnection[];
}

export function cloneLegacyNode(
  node: LegacyNode,
  dx: number,
  dy: number,
): LegacyNode {
  const copy = JSON.parse(JSON.stringify(node)) as LegacyNode;
  copy.id = crypto.randomUUID();
  copy.x = node.x + dx;
  copy.y = node.y + dy;
  copy.settings = { ...copy.settings, running: false };
  return copy;
}

/** Fork-first from history `copySelectedNodes`. */
export function buildClipboardFromSelection(
  selectedIds: string[],
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): NodeClipboard | null {
  if (!selectedIds.length) return null;
  const idSet = new Set(selectedIds);
  const picked = nodes.filter((n) => idSet.has(n.id));
  if (!picked.length) return null;
  const pickedIds = new Set(picked.map((n) => n.id));
  const pickedConnections = connections.filter(
    (c) => pickedIds.has(c.from) && pickedIds.has(c.to),
  );
  return {
    nodes: JSON.parse(JSON.stringify(picked)) as LegacyNode[],
    connections: JSON.parse(JSON.stringify(pickedConnections)) as LegacyConnection[],
  };
}

/** Fork-first from history `pasteNodes` — paste at world anchor (mouse position). */
export function pasteClipboardAt(
  clipboard: NodeClipboard,
  anchorWorldX: number,
  anchorWorldY: number,
): {
  nodes: LegacyNode[];
  connections: LegacyConnection[];
  selectedIds: string[];
} {
  const clipNodes = clipboard.nodes;
  if (!clipNodes.length) {
    return { nodes: [], connections: [], selectedIds: [] };
  }
  const xs = clipNodes.map((n) => n.x);
  const ys = clipNodes.map((n) => n.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dx = anchorWorldX - cx;
  const dy = anchorWorldY - cy;
  const idMap = new Map<string, string>();
  const copies = clipNodes.map((n) => {
    const c = cloneLegacyNode(n, dx, dy);
    idMap.set(n.id, c.id);
    return c;
  });
  copies.forEach((c) => {
    if (c.kind === "group" && Array.isArray(c.settings?.items)) {
      c.settings = {
        ...c.settings,
        items: (c.settings.items as string[]).map((id) => idMap.get(id) || id),
      };
    }
  });
  const newConnections = clipboard.connections
    .map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      from: idMap.get(c.from) ?? "",
      to: idMap.get(c.to) ?? "",
    }))
    .filter((c) => c.from && c.to && c.from !== c.to);
  return {
    nodes: copies,
    connections: newConnections,
    selectedIds: copies.map((c) => c.id),
  };
}

export function createImageNodeFromUrl(
  url: string,
  x: number,
  y: number,
  title = "图片",
): LegacyNode {
  return createLegacyNode({
    kind: "image",
    x,
    y,
    title,
    images: [{ url, kind: "image" }],
  });
}
