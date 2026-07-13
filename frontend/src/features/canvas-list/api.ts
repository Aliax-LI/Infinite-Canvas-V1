import { api } from "../../shared/api/client";
import type { CanvasRecord, ProjectRecord } from "../../types/api";

export const canvasListApi = {
  listCanvases: () =>
    api.get<{ canvases: CanvasRecord[] }>("/api/canvases"),
  listTrash: () =>
    api.get<{ canvases: CanvasRecord[]; retention_days: number }>(
      "/api/canvases/trash",
    ),
  createCanvas: (payload: {
    title?: string;
    icon?: string;
    kind?: string;
    project?: string;
    board_x?: number;
    board_y?: number;
  }) => api.post<{ canvas: CanvasRecord }>("/api/canvases", payload),
  deleteCanvas: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/canvases/${id}`),
  restoreCanvas: (id: string) =>
    api.post<{ canvas: CanvasRecord }>(`/api/canvases/${id}/restore`),
  purgeCanvas: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/canvases/${id}/purge`),
  restoreCanvasesBatch: (ids: string[]) =>
    api.post<{
      ok: boolean;
      restored: number;
      failed: number;
      errors: Array<{ id: string; error: string }>;
    }>("/api/canvases/trash/restore-batch", { ids }),
  purgeCanvasesBatch: (ids: string[]) =>
    api.post<{
      ok: boolean;
      purged: number;
      failed: number;
      errors: Array<{ id: string; error: string }>;
    }>("/api/canvases/trash/purge-batch", { ids }),
  updateMeta: (
    id: string,
    payload: Partial<
      Pick<
        CanvasRecord,
        "title" | "icon" | "project" | "board_x" | "board_y" | "color"
      >
    >,
  ) =>
    api.post<{ canvas: CanvasRecord }>(`/api/canvases/${id}/meta`, payload),
  getCanvas: (id: string) =>
    api.get<{ canvas: CanvasRecord }>(`/api/canvases/${id}`),
};

export const projectApi = {
  list: () => api.get<{ projects: ProjectRecord[] }>("/api/projects"),
  create: (name: string) =>
    api.post<{ project: ProjectRecord }>("/api/projects", { name }),
  update: (id: string, payload: { name?: string; order?: number }) =>
    api.post<{ project: ProjectRecord }>(`/api/projects/${id}`, payload),
  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/projects/${id}`),
};
