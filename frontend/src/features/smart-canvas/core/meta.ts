import { api } from "../../../shared/api/client";

export interface CanvasMeta {
  id: string;
  title: string;
  icon: string;
  kind: string;
  updated_at: number;
}

export async function fetchCanvasMeta(canvasId: string): Promise<CanvasMeta> {
  return api.get<CanvasMeta>(`/api/canvases/${canvasId}/meta`);
}

/** @alias fetchCanvasMeta */
export const loadCanvasMeta = fetchCanvasMeta;

export async function updateCanvasMeta(
  canvasId: string,
  patch: Partial<Pick<CanvasMeta, "title" | "icon"> & { project?: string }>,
): Promise<CanvasMeta> {
  const res = await api.post<{ canvas: CanvasMeta }>(
    `/api/canvases/${canvasId}/meta`,
    patch,
  );
  return res.canvas;
}
