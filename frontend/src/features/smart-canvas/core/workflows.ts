import { api } from "../../../shared/api/client";
import type { CanvasConnection, SmartNode } from "./types";

export interface WorkflowExportPayload {
  nodes: SmartNode[];
  connections: CanvasConnection[];
  filename?: string;
  include_resources?: boolean;
}

export async function exportCanvasWorkflow(
  payload: WorkflowExportPayload,
): Promise<Blob> {
  const response = await fetch("/api/canvas-workflows/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodes: payload.nodes,
      connections: payload.connections,
      filename: payload.filename ?? "canvas-workflow.zip",
      include_resources: payload.include_resources ?? true,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Export failed");
  }
  return response.blob();
}

export async function importCanvasWorkflow(
  file: File,
): Promise<{ nodes: SmartNode[]; connections: CanvasConnection[] }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/canvas-workflows/import", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Import failed");
  }
  const data = (await response.json()) as {
    nodes?: SmartNode[];
    connections?: CanvasConnection[];
    workflow?: { nodes?: SmartNode[]; connections?: CanvasConnection[] };
  };
  return {
    nodes: data.nodes ?? data.workflow?.nodes ?? [],
    connections: data.connections ?? data.workflow?.connections ?? [],
  };
}

export async function exportWorkflowToLibrary(
  payload: WorkflowExportPayload & {
    library_id: string;
    category_id: string;
    name?: string;
  },
) {
  return api.post<{ item: Record<string, unknown> }>(
    "/api/canvas-workflows/export-to-library",
    payload,
  );
}

export async function exportWorkflowZip(payload: {
  name?: string;
  filename?: string;
  nodes: SmartNode[];
  connections: CanvasConnection[];
}): Promise<Blob> {
  return exportCanvasWorkflow({
    nodes: payload.nodes,
    connections: payload.connections,
    filename: payload.filename ?? "canvas-workflow.zip",
  });
}

export async function importWorkflowFile(file: File): Promise<{
  name?: string;
  nodes: SmartNode[];
  connections: CanvasConnection[];
}> {
  const data = await importCanvasWorkflow(file);
  return {
    name: file.name.replace(/\.zip$/i, ""),
    nodes: data.nodes,
    connections: data.connections,
  };
}
