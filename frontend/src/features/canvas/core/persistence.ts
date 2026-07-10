import { api } from "../../../shared/api/client";
import { getClientId } from "../../../shared/utils";
import {
  DEFAULT_VIEWPORT,
  normalizeLegacyConnections,
  normalizeLegacyNodes,
  type LegacyCanvasDoc,
  type LegacyConnection,
  type LegacyNode,
  type ViewportState,
} from "./types";

export async function loadLegacyCanvas(id: string): Promise<LegacyCanvasDoc> {
  const res = await api.get<{ canvas: Record<string, unknown> }>(
    `/api/canvases/${id}`,
  );
  const raw = res.canvas;
  return {
    id: String(raw.id ?? id),
    title: String(raw.title ?? "未命名画布"),
    nodes: normalizeLegacyNodes(raw.nodes),
    connections: normalizeLegacyConnections(raw.connections),
    viewport: (raw.viewport as ViewportState) ?? { ...DEFAULT_VIEWPORT },
    settings: (raw.settings as Record<string, unknown>) ?? {},
    updated_at: Number(raw.updated_at ?? 0),
  };
}

export async function saveLegacyCanvas(
  id: string,
  payload: {
    title: string;
    nodes: LegacyNode[];
    connections?: LegacyConnection[];
    viewport: ViewportState;
    settings?: Record<string, unknown>;
    base_updated_at?: number;
  },
): Promise<LegacyCanvasDoc> {
  const res = await api.put<{ canvas: Record<string, unknown> }>(
    `/api/canvases/${id}`,
    {
      title: payload.title,
      nodes: payload.nodes,
      connections: payload.connections ?? [],
      viewport: payload.viewport,
      settings: payload.settings ?? {},
      base_updated_at: payload.base_updated_at,
      client_id: getClientId(),
    },
  );
  const raw = res.canvas;
  return {
    id: String(raw.id ?? id),
    title: String(raw.title ?? payload.title),
    nodes: normalizeLegacyNodes(raw.nodes),
    connections: normalizeLegacyConnections(raw.connections),
    viewport: (raw.viewport as ViewportState) ?? payload.viewport,
    settings: (raw.settings as Record<string, unknown>) ?? {},
    updated_at: Number(raw.updated_at ?? 0),
  };
}
