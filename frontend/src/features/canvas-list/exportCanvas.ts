import { api } from "../../shared/api/client";
import type { CanvasDoc } from "../../types/api";
import {
  buildCanvasAssetsZip,
  downloadBlob,
  safeExportBase,
} from "./canvasZip";

export async function exportCanvasJson(canvasId: string, title?: string): Promise<void> {
  const data = await api.get<{ canvas: CanvasDoc }>(`/api/canvases/${canvasId}`);
  const cv = data.canvas;
  const base = safeExportBase(title || cv.title);
  const blob = new Blob([JSON.stringify(cv, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${base}.json`);
}

/** Fork-first: history `exportCanvasWithResources` — canvas.json + media ZIP. */
export async function exportCanvasWithAssets(
  canvasId: string,
  title?: string,
): Promise<{ included: number; skipped: number }> {
  const data = await api.get<{ canvas: CanvasDoc }>(`/api/canvases/${canvasId}`);
  const cv = data.canvas;
  const base = safeExportBase(title || cv.title);
  const { blob, included, skipped } = await buildCanvasAssetsZip(
    canvasId,
    cv,
    title || cv.title,
  );
  downloadBlob(blob, `${base}.zip`);
  return { included, skipped };
}
