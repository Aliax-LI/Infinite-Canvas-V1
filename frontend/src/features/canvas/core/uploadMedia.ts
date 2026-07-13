import { api } from "../../../shared/api/client";
import { createLegacyNode, type LegacyNode } from "./types";

export const CANVAS_UPLOAD_MAX = 20;

export interface UploadedMediaFile {
  url: string;
  name?: string;
  kind?: string;
}

export function canvasMediaPreviewUrl(url: string, width = 512): string {
  const raw = String(url || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  // History parity: remote https URLs must go through download proxy or <img> stays blank.
  if (!raw.startsWith("/output/") && !raw.startsWith("/assets/")) {
    return canvasDisplayMediaUrl(raw);
  }
  const w = Math.max(64, Math.min(2048, Math.round(width)));
  return `/api/media-preview?w=${w}&url=${encodeURIComponent(raw)}`;
}

/** Fork-first from history `canvasDisplayMediaUrl` — proxy remote URLs for preview/download. */
export function canvasDisplayMediaUrl(url: string, name = ""): string {
  const raw = String(url || "").trim();
  if (
    !raw ||
    raw.startsWith("/assets/") ||
    raw.startsWith("/output/") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:")
  ) {
    return raw;
  }
  if (!/^https?:\/\//i.test(raw)) return raw;
  const filename =
    name ||
    decodeURIComponent(raw.split("?")[0].split("/").filter(Boolean).pop() || "") ||
    "preview";
  return `/api/download-output?inline=1&url=${encodeURIComponent(raw)}&name=${encodeURIComponent(filename)}`;
}

export async function uploadCanvasMediaFiles(
  files: FileList | File[],
): Promise<UploadedMediaFile[]> {
  const list = [...files].slice(0, CANVAS_UPLOAD_MAX);
  if (!list.length) return [];
  const form = new FormData();
  list.forEach((file) => form.append("files", file));
  const data = await api.upload<{ files: UploadedMediaFile[] }>(
    "/api/ai/upload",
    form,
  );
  return data.files ?? [];
}

/** Create image nodes at world point — mirrors history uploadMediaFiles layout. */
export function legacyNodesFromUploads(
  uploaded: UploadedMediaFile[],
  baseX: number,
  baseY: number,
): LegacyNode[] {
  return uploaded.map((file, i) =>
    createLegacyNode({
      kind: "image",
      x: baseX + i * 36,
      y: baseY + i * 36,
      title: file.name || "图片",
      images: [{ url: file.url, kind: file.kind || "image", name: file.name }],
    }),
  );
}

export async function uploadAndCreateLegacyNodes(
  files: FileList | File[],
  baseX: number,
  baseY: number,
): Promise<LegacyNode[]> {
  const uploaded = await uploadCanvasMediaFiles(files);
  return legacyNodesFromUploads(uploaded, baseX, baseY);
}
