import type { CanvasConnection, SmartNode } from "./types";
import { normalizeNode } from "./types";

export function applyMergedServerCanvas(
  localNodes: SmartNode[],
  remoteNodes: SmartNode[],
  localUpdatedAt: number,
  remoteUpdatedAt: number,
): SmartNode[] {
  const remote = remoteNodes.map(normalizeNode);
  if (remoteUpdatedAt > localUpdatedAt) {
    return remote;
  }
  const map = new Map(localNodes.map((n) => [n.id, { ...n }]));
  for (const r of remote) {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
      continue;
    }
    map.set(r.id, {
      ...existing,
      images: r.images?.length ? r.images : existing.images,
      status: r.status ?? existing.status,
      prompt: r.prompt || existing.prompt,
    });
  }
  return [...map.values()];
}

export function mergeCanvasPayload(
  local: {
    nodes: SmartNode[];
    connections: CanvasConnection[];
    updatedAt: number;
  },
  remote: {
    nodes: SmartNode[];
    connections: CanvasConnection[];
    updatedAt: number;
  },
): { nodes: SmartNode[]; connections: CanvasConnection[]; acceptedRemote: boolean } {
  const acceptedRemote = remote.updatedAt > local.updatedAt;
  return {
    nodes: applyMergedServerCanvas(
      local.nodes,
      remote.nodes,
      local.updatedAt,
      remote.updatedAt,
    ),
    connections: acceptedRemote ? remote.connections : local.connections,
    acceptedRemote,
  };
}
