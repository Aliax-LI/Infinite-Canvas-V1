import type { LegacyConnection, LegacyNode } from "./types";

function nodeRect(node: LegacyNode) {
  return {
    x: node.x,
    y: node.y,
    w: node.width || 280,
    h: node.height || 200,
  };
}

function canvasArrangeAtomicIds(ids: string[], nodes: LegacyNode[]): string[] {
  const out = new Set(ids.filter((id) => nodes.some((n) => n.id === id)));
  let changed = true;
  while (changed) {
    changed = false;
    nodes
      .filter((n) => n.kind === "group" && Array.isArray(n.settings?.items))
      .forEach((group) => {
        const items = group.settings!.items as string[];
        items.forEach((itemId) => {
          if (!out.has(itemId)) return;
          out.delete(itemId);
          out.add(group.id);
          changed = true;
        });
      });
  }
  return [...out];
}

function moveNodeAtom(
  node: LegacyNode,
  nodes: LegacyNode[],
  x: number,
  y: number,
): LegacyNode[] {
  const dx = Math.round(x - node.x);
  const dy = Math.round(y - node.y);
  const moveIds = new Set<string>([node.id]);
  if (node.kind === "group" && Array.isArray(node.settings?.items)) {
    (node.settings.items as string[]).forEach((id) => moveIds.add(id));
  }
  return nodes.map((n) =>
    moveIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
  );
}

/** Fork-first: history `arrangeIdsByConnections`. */
export function arrangeSelectedNodes(
  selectedIds: string[],
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): LegacyNode[] | null {
  const atomic = canvasArrangeAtomicIds(selectedIds, nodes);
  const selectedNodes = atomic
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is LegacyNode => Boolean(n));
  if (selectedNodes.length < 2) return null;

  const idSet = new Set(atomic);
  const rects = selectedNodes.map((n) => ({ node: n, rect: nodeRect(n) }));
  const startX = Math.min(...rects.map((item) => item.rect.x));
  const startY = Math.min(...rects.map((item) => item.rect.y));
  const internal = connections.filter(
    (c) => idSet.has(c.from) && idSet.has(c.to),
  );

  const depth = new Map(selectedNodes.map((n) => [n.id, 0]));
  if (internal.length) {
    const indegree = new Map(selectedNodes.map((n) => [n.id, 0]));
    internal.forEach((c) =>
      indegree.set(c.to, (indegree.get(c.to) || 0) + 1),
    );
    const roots = [...indegree.entries()]
      .filter(([, n]) => n === 0)
      .map(([id]) => id);
    const queue = roots.length ? roots.slice() : [selectedNodes[0].id];
    const seen = new Set(queue);
    while (queue.length) {
      const id = queue.shift()!;
      internal
        .filter((c) => c.from === id)
        .forEach((c) => {
          depth.set(
            c.to,
            Math.max(depth.get(c.to) || 0, (depth.get(id) || 0) + 1),
          );
          if (!seen.has(c.to)) {
            seen.add(c.to);
            queue.push(c.to);
          }
        });
    }
  }

  const groups = new Map<number, LegacyNode[]>();
  selectedNodes.forEach((n) => {
    const d = depth.get(n.id) || 0;
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(n);
  });

  let nextNodes = [...nodes];
  let x = startX;
  const sortedDepths = [...groups.keys()].sort((a, b) => a - b);
  sortedDepths.forEach((d) => {
    const col = (groups.get(d) ?? [])
      .slice()
      .sort(
        (a, b) =>
          nodeRect(a).y - nodeRect(b).y ||
          String(a.id).localeCompare(String(b.id)),
      );
    let y = startY;
    let maxW = 0;
    col.forEach((n) => {
      const r = nodeRect(n);
      nextNodes = moveNodeAtom(n, nextNodes, x, y);
      y += Math.max(120, r.h) + 56;
      maxW = Math.max(maxW, Math.max(220, r.w));
    });
    x += maxW + 180;
  });
  return nextNodes;
}
