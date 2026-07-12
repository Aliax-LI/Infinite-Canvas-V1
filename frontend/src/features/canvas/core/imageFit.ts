/** Image display fit inside classic canvas media nodes. */
export type LegacyImageFit = "contain" | "cover";

const HEADER_FOOTER_CHROME = 56;
const MIN_MEDIA_H = 96;
const MAX_MEDIA_H = 480;

export function readImageFit(settings: Record<string, unknown> | undefined): LegacyImageFit {
  const raw = String(settings?.imageFit ?? settings?.fit ?? "contain").toLowerCase();
  return raw === "cover" ? "cover" : "contain";
}

export function readNaturalSize(settings: Record<string, unknown> | undefined): {
  w: number;
  h: number;
} | null {
  const w = Number(settings?.naturalW ?? settings?.natural_w ?? 0);
  const h = Number(settings?.naturalH ?? settings?.natural_h ?? 0);
  if (w > 0 && h > 0) return { w, h };
  return null;
}

/** Media box height for a fixed node width, forked from history aspect sizing. */
export function mediaHeightForAspect(
  nodeWidth: number,
  naturalW: number,
  naturalH: number,
): number {
  const w = Math.max(1, nodeWidth);
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const h = Math.round(w * (nh / nw));
  return Math.min(MAX_MEDIA_H, Math.max(MIN_MEDIA_H, h));
}

export function nodeHeightForMedia(
  nodeWidth: number,
  naturalW: number,
  naturalH: number,
  chrome = HEADER_FOOTER_CHROME,
): number {
  return mediaHeightForAspect(nodeWidth, naturalW, naturalH) + chrome;
}

export function imageCaption(
  title: string,
  imageName?: string,
  url?: string,
): string {
  const name = (imageName || "").trim();
  if (name && name !== "生成结果" && !/^生成结果_\d+$/.test(name)) return name;
  const t = (title || "").trim();
  if (t && t !== "生成结果" && !/^生成结果_\d+$/.test(t) && t !== "图片") return t;
  if (url) {
    try {
      const path = url.split("?")[0] || url;
      const base = path.split("/").pop() || "";
      if (base) return decodeURIComponent(base);
    } catch {
      /* ignore */
    }
  }
  return "";
}
