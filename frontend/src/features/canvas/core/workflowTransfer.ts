import {
  normalizeLegacyConnections,
  normalizeLegacyNodes,
  type LegacyConnection,
  type LegacyNode,
} from "./types";
import { cloneLegacyNode } from "./clipboard";
import { api } from "../../../shared/api/client";

export const WORKFLOW_FORMAT = "infinite-canvas-workflow";

export interface WorkflowPayload {
  format: typeof WORKFLOW_FORMAT;
  version: number;
  exported_at: number;
  nodes: LegacyNode[];
  connections: LegacyConnection[];
}

export function buildWorkflowPayload(
  selectedIds: string[],
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): WorkflowPayload | null {
  const idSet = new Set(selectedIds.filter((id) => nodes.some((n) => n.id === id)));
  if (!idSet.size) return null;
  const pickedNodes = nodes.filter((n) => idSet.has(n.id));
  const pickedConnections = connections.filter(
    (c) => idSet.has(c.from) && idSet.has(c.to),
  );
  return {
    format: WORKFLOW_FORMAT,
    version: 1,
    exported_at: Date.now(),
    nodes: JSON.parse(JSON.stringify(pickedNodes)) as LegacyNode[],
    connections: JSON.parse(JSON.stringify(pickedConnections)) as LegacyConnection[],
  };
}

export function workflowFilename(title: string, ext: string): string {
  const safe =
    (title || "canvas-workflow")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .slice(0, 48) || "canvas-workflow";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `${safe}-${stamp}.${ext}`;
}

export function downloadWorkflowJson(payload: WorkflowPayload, title: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = workflowFilename(title, "workflow.json");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1200);
}

export function parseWorkflowPayload(raw: unknown): WorkflowPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== WORKFLOW_FORMAT) return null;
  const nodes = normalizeLegacyNodes(o.nodes);
  const connections = normalizeLegacyConnections(o.connections);
  if (!nodes.length) return null;
  return {
    format: WORKFLOW_FORMAT,
    version: Number(o.version ?? 1),
    exported_at: Number(o.exported_at ?? Date.now()),
    nodes,
    connections,
  };
}

/** Paste workflow nodes at anchor — remaps ids like history import. */
export function importWorkflowAt(
  payload: WorkflowPayload,
  anchorWorldX: number,
  anchorWorldY: number,
): {
  nodes: LegacyNode[];
  connections: LegacyConnection[];
  selectedIds: string[];
} {
  const clipNodes = payload.nodes;
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
  const newConnections = payload.connections
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

export interface WorkflowImportResponse {
  nodes?: unknown[];
  connections?: unknown[];
  workflow?: { nodes?: unknown[]; connections?: unknown[] };
}

export function workflowPayloadFromImportResponse(
  res: WorkflowImportResponse,
): WorkflowPayload | null {
  const nodesRaw = res.nodes ?? res.workflow?.nodes;
  const connectionsRaw = res.connections ?? res.workflow?.connections ?? [];
  const nodes = normalizeLegacyNodes(nodesRaw);
  if (!nodes.length) return null;
  const connections = normalizeLegacyConnections(connectionsRaw);
  return {
    format: WORKFLOW_FORMAT,
    version: 1,
    exported_at: Date.now(),
    nodes,
    connections,
  };
}

export async function exportWorkflowZip(
  selectedIds: string[],
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  title: string,
): Promise<void> {
  const idSet = new Set(selectedIds.filter((id) => nodes.some((n) => n.id === id)));
  const pickedNodes = nodes.filter((n) => idSet.has(n.id));
  const pickedConnections = connections.filter(
    (c) => idSet.has(c.from) && idSet.has(c.to),
  );
  if (!pickedNodes.length) return;
  const blob = await api.postBlob("/api/canvas-workflows/export", {
    nodes: pickedNodes,
    connections: pickedConnections,
    filename: workflowFilename(title, "zip"),
    include_resources: true,
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = workflowFilename(title, "zip");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1200);
}

export async function importWorkflowZipFile(file: File): Promise<WorkflowPayload | null> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.upload<WorkflowImportResponse>(
    "/api/canvas-workflows/import",
    form,
  );
  return workflowPayloadFromImportResponse(res);
}
