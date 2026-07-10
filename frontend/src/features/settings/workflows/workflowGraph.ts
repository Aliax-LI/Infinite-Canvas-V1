export interface ComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

const NODE_W = 130;
const NODE_H = 50;
const X_GAP = 36;
const Y_GAP = 14;

export interface GraphNodeLayout {
  id: string;
  x: number;
  y: number;
  label: string;
  sub: string;
  exposedCount: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNodeLayout[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

function nodeLabel(node: ComfyNode) {
  return node._meta?.title || node.class_type || "Node";
}

function computeLayers(workflow: ComfyWorkflow) {
  const ids = Object.keys(workflow);
  const incoming: Record<string, Set<string>> = {};
  const outgoing: Record<string, Set<string>> = {};
  ids.forEach((id) => {
    incoming[id] = new Set();
    outgoing[id] = new Set();
  });
  ids.forEach((id) => {
    const inputs = workflow[id]?.inputs ?? {};
    Object.values(inputs).forEach((v) => {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && workflow[v[0]]) {
        incoming[id].add(v[0]);
        outgoing[v[0]].add(id);
      }
    });
  });
  const layer: Record<string, number> = {};
  const visited = new Set<string>();
  function dfs(id: string, lv: number) {
    if (visited.has(id)) return;
    layer[id] = Math.max(layer[id] ?? 0, lv);
    visited.add(id);
    outgoing[id]?.forEach((child) => dfs(child, lv + 1));
  }
  ids.forEach((id) => {
    if (incoming[id].size === 0) dfs(id, 0);
  });
  ids.forEach((id) => {
    if (!(id in layer)) layer[id] = 0;
  });
  const buckets: Record<number, string[]> = {};
  ids.forEach((id) => {
    const lv = layer[id];
    (buckets[lv] = buckets[lv] ?? []).push(id);
  });
  return { buckets };
}

export function buildGraphLayout(
  workflow: ComfyWorkflow,
  exposedFields: { node: string }[],
): GraphLayout {
  if (!workflow || !Object.keys(workflow).length) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }
  const { buckets } = computeLayers(workflow);
  const positions: Record<string, { x: number; y: number }> = {};
  const sortedLevels = Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b);
  let maxRows = 0;
  sortedLevels.forEach((lv) => {
    const ids = buckets[lv].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    ids.forEach((id, idx) => {
      positions[id] = { x: lv * (NODE_W + X_GAP) + 16, y: idx * (NODE_H + Y_GAP) + 16 };
    });
    maxRows = Math.max(maxRows, ids.length);
  });

  const edges: GraphEdge[] = [];
  Object.keys(workflow).forEach((toId) => {
    const inputs = workflow[toId]?.inputs ?? {};
    const seen = new Set<string>();
    Object.values(inputs).forEach((v) => {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && positions[v[0]]) {
        if (seen.has(v[0])) return;
        seen.add(v[0]);
        edges.push({ from: v[0], to: toId });
      }
    });
  });

  const nodes: GraphNodeLayout[] = Object.entries(workflow).map(([id, node]) => {
    const pos = positions[id] ?? { x: 16, y: 16 };
    return {
      id,
      x: pos.x,
      y: pos.y,
      label: nodeLabel(node),
      sub: node.class_type ?? "",
      exposedCount: exposedFields.filter((f) => f.node === id).length,
    };
  });

  return {
    nodes,
    edges,
    width: sortedLevels.length * (NODE_W + X_GAP) + 16,
    height: maxRows * (NODE_H + Y_GAP) + 16,
  };
}

export const GRAPH_NODE_SIZE = { w: NODE_W, h: NODE_H };
