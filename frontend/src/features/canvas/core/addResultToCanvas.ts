import { canvasListApi } from "../../canvas-list/api";
import { api } from "../../../shared/api/client";
import type { CanvasRecord } from "../../../types/api";
import { loadLegacyCanvas, saveLegacyCanvas } from "./persistence";
import {
  createLegacyNode,
  DEFAULT_VIEWPORT,
  LEGACY_NODE_H,
  LEGACY_NODE_W,
  type LegacyNode,
  type ViewportState,
} from "./types";

export const LAST_CANVAS_ID_KEY = "studio_last_canvas_id";

const DEFAULT_VIEW_W = 800;
const DEFAULT_VIEW_H = 600;

export function rememberCanvasId(id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(LAST_CANVAS_ID_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readRememberedCanvasId(): string {
  try {
    return localStorage.getItem(LAST_CANVAS_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function isClassicCanvas(record: Pick<CanvasRecord, "kind">): boolean {
  return (record.kind ?? "smart") === "classic";
}

/** World position for the next imported image node(s). */
export function nextAppendPosition(
  nodes: LegacyNode[],
  viewport: ViewportState = DEFAULT_VIEWPORT,
): { x: number; y: number } {
  const scale = viewport.scale || 1;
  if (!nodes.length) {
    const cx = (-viewport.x + DEFAULT_VIEW_W / 2) / scale;
    const cy = (-viewport.y + DEFAULT_VIEW_H / 2) / scale;
    return {
      x: Math.round(cx - LEGACY_NODE_W / 2),
      y: Math.round(cy - LEGACY_NODE_H / 2),
    };
  }
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    maxX = Math.max(maxX, node.x + (node.width || LEGACY_NODE_W));
    maxY = Math.max(maxY, node.y);
  }
  return { x: maxX + 40, y: maxY };
}

export function legacyNodesFromResultUrls(
  urls: string[],
  baseX: number,
  baseY: number,
  title?: string,
): LegacyNode[] {
  const label = title?.trim() || "生成结果";
  return urls
    .filter(Boolean)
    .map((url, index) =>
      createLegacyNode({
        kind: "image",
        x: baseX + index * 36,
        y: baseY + index * 36,
        title: urls.length === 1 ? label : `${label}_${index + 1}`,
        images: [{ url, kind: "image", name: label }],
      }),
    );
}

async function canvasExistsAndClassic(canvasId: string): Promise<boolean> {
  try {
    const res = await api.get<{ canvas: CanvasRecord }>(`/api/canvases/${canvasId}`);
    return isClassicCanvas(res.canvas);
  } catch {
    return false;
  }
}

/** Resolve a classic canvas id: remembered → newest classic → create empty classic. */
export async function resolveTargetClassicCanvasId(): Promise<string> {
  const remembered = readRememberedCanvasId();
  if (remembered && (await canvasExistsAndClassic(remembered))) {
    return remembered;
  }

  const { canvases } = await canvasListApi.listCanvases();
  const classic = canvases
    .filter((c) => isClassicCanvas(c) && !c.deleted_at)
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
  if (classic.length) {
    return classic[0].id;
  }

  const created = await canvasListApi.createCanvas({
    title: "工具导入",
    kind: "classic",
  });
  return created.canvas.id;
}

export async function appendUrlsToClassicCanvas(
  canvasId: string,
  urls: string[],
  options?: { title?: string },
): Promise<{ canvasId: string; addedCount: number }> {
  const cleanUrls = urls.filter(Boolean);
  if (!cleanUrls.length) {
    throw new Error("no urls");
  }

  const doc = await loadLegacyCanvas(canvasId);
  const pos = nextAppendPosition(doc.nodes, doc.viewport);
  const newNodes = legacyNodesFromResultUrls(
    cleanUrls,
    pos.x,
    pos.y,
    options?.title,
  );
  const saved = await saveLegacyCanvas(canvasId, {
    title: doc.title,
    nodes: [...doc.nodes, ...newNodes],
    connections: doc.connections ?? [],
    viewport: doc.viewport,
    settings: doc.settings,
    base_updated_at: doc.updated_at,
  });
  rememberCanvasId(saved.id);
  return { canvasId: saved.id, addedCount: newNodes.length };
}
