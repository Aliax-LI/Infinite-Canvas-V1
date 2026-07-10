import { api } from "../../../shared/api/client";
import { getClientId } from "../../../shared/utils";
import type { CanvasDoc } from "../../../types/api";
import {
  DEFAULT_VIEWPORT,
  normalizeCanvasPayload,
  type CanvasConnection,
  type SmartNode,
  type ViewportState,
} from "./types";

export async function loadCanvas(id: string): Promise<CanvasDoc> {
  const res = await api.get<{ canvas: Record<string, unknown> }>(
    `/api/canvases/${id}`,
  );
  const raw = res.canvas;
  const { nodes, connections } = normalizeCanvasPayload(raw);
  return {
    id: String(raw.id ?? id),
    title: String(raw.title ?? "未命名画布"),
    icon: String(raw.icon ?? "🧩"),
    kind: String(raw.kind ?? "smart"),
    nodes,
    connections,
    viewport: (raw.viewport as ViewportState) ?? DEFAULT_VIEWPORT,
    logs: Array.isArray(raw.logs) ? (raw.logs as CanvasDoc["logs"]) : [],
    settings: (raw.settings as Record<string, unknown>) ?? {},
    updated_at: Number(raw.updated_at ?? 0),
  };
}

export async function saveCanvas(
  id: string,
  payload: {
    title: string;
    icon: string;
    nodes: SmartNode[];
    connections: CanvasConnection[];
    viewport: ViewportState;
    logs?: CanvasDoc["logs"];
    settings?: Record<string, unknown>;
    base_updated_at?: number;
  },
): Promise<CanvasDoc> {
  const res = await api.put<{ canvas: Record<string, unknown> }>(
    `/api/canvases/${id}`,
    {
      ...payload,
      client_id: getClientId(),
    },
  );
  const raw = res.canvas;
  const { nodes, connections } = normalizeCanvasPayload(raw);
  return {
    id: String(raw.id ?? id),
    title: String(raw.title ?? payload.title),
    icon: String(raw.icon ?? payload.icon),
    kind: String(raw.kind ?? "smart"),
    nodes,
    connections,
    viewport: (raw.viewport as ViewportState) ?? payload.viewport,
    logs: Array.isArray(raw.logs) ? (raw.logs as CanvasDoc["logs"]) : [],
    settings: (raw.settings as Record<string, unknown>) ?? {},
    updated_at: Number(raw.updated_at ?? 0),
  };
}

export async function touchCanvas(id: string) {
  return api.post<{ updated_at: number }>(`/api/canvases/${id}/touch`);
}

let touchTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleTouch(id: string, delayMs = 5000) {
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    touchCanvas(id).catch(() => {});
  }, delayMs);
}

export function serializeCanvas(doc: CanvasDoc): string {
  return JSON.stringify({
    title: doc.title,
    icon: doc.icon,
    nodes: doc.nodes,
    connections: doc.connections,
    viewport: doc.viewport,
    logs: doc.logs,
    settings: doc.settings,
  });
}

export function deserializeCanvas(json: string): Partial<CanvasDoc> | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    const { nodes, connections } = normalizeCanvasPayload(data);
    return {
      title: String(data.title ?? ""),
      icon: String(data.icon ?? "🧩"),
      nodes,
      connections,
      viewport: (data.viewport as ViewportState) ?? DEFAULT_VIEWPORT,
      logs: Array.isArray(data.logs) ? (data.logs as CanvasDoc["logs"]) : [],
      settings: (data.settings as Record<string, unknown>) ?? {},
    };
  } catch {
    return null;
  }
}
