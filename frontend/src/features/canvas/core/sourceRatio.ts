/**
 * Fork-first from history canvas.js:
 * `ratioPartsFromDimensions` / `apiImageSize` (source|custom) / `generatorSizeForRun`.
 */

import {
  resolveOnlineSize,
  type OnlineRatio,
  type OnlineResolution,
} from "../../tools/pages/onlineSize";

const RES_LONG_SIDE: Record<string, number> = {
  "1k": 1536,
  "2k": 2048,
  "4k": 3840,
};

const RES_PIXEL_LIMIT: Record<string, number> = {
  "1k": 1_572_864,
  "2k": 4_194_304,
  "4k": 8_294_400,
};

export function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.round(Number(a) || 0));
  let y = Math.abs(Math.round(Number(b) || 0));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Best small integer ratio approximating width:height (history maxPart=21). */
export function ratioPartsFromDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const target = w / h;
  let best = { width: 1, height: 1, score: Infinity };
  const maxPart = 21;
  for (let rw = 1; rw <= maxPart; rw++) {
    for (let rh = 1; rh <= maxPart; rh++) {
      const ratio = rw / rh;
      const relativeError = Math.abs(ratio - target) / target;
      const complexityPenalty = Math.max(rw, rh) * 0.0008;
      const score = relativeError + complexityPenalty;
      if (score < best.score) best = { width: rw, height: rh, score };
    }
  }
  const g = gcdInt(best.width, best.height);
  return { width: best.width / g, height: best.height / g };
}

export function parseRatioValue(value: string): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes(":")) {
    const [w, h] = raw.split(":").map(Number);
    if (w > 0 && h > 0) return w / h;
  }
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** Pixel size string from custom/source ratio + resolution ladder. */
export function sizeFromCustomRatio(
  customRatio: string,
  resolution: OnlineResolution | string,
): string | null {
  const parsed = parseRatioValue(customRatio);
  if (!parsed) return null;
  const resolutionKey = resolution || "1k";
  const longSide = RES_LONG_SIDE[resolutionKey] || 1024;
  const pixelLimit = RES_PIXEL_LIMIT[resolutionKey] || longSide * longSide;
  const rawWidth =
    parsed >= 1
      ? longSide
      : Math.min(longSide * parsed, Math.sqrt(pixelLimit * parsed));
  const rawHeight =
    parsed >= 1
      ? Math.min(longSide / parsed, Math.sqrt(pixelLimit / parsed))
      : longSide;
  const width = Math.floor(rawWidth / 16) * 16;
  const height = Math.floor(rawHeight / 16) * 16;
  return `${Math.max(64, width)}x${Math.max(64, height)}`;
}

export function getImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

export async function customRatioFromImageUrl(
  url: string,
): Promise<string | null> {
  try {
    const dims = await getImageDimensions(url);
    const parts = ratioPartsFromDimensions(dims.width, dims.height);
    return `${parts.width}:${parts.height}`;
  } catch {
    return null;
  }
}

/**
 * Resolve API `size` for a generator node.
 * When ratio === "source", derive custom ratio from first ref (or settings.customRatio).
 */
export async function resolveGeneratorApiSize(opts: {
  ratio: string;
  resolution: OnlineResolution | string;
  customRatio?: string;
  customSize?: string;
  size?: string;
  refUrls?: string[];
}): Promise<string> {
  const resolution = (opts.resolution || "1k") as OnlineResolution;
  if (resolution === ("custom" as OnlineResolution) && opts.customSize) {
    return String(opts.customSize).trim();
  }

  let customRatio = String(opts.customRatio || "").trim();
  if (opts.ratio === "source") {
    if (!customRatio && opts.refUrls?.[0]) {
      const derived = await customRatioFromImageUrl(opts.refUrls[0]);
      if (derived) customRatio = derived;
    }
    if (customRatio) {
      return (
        sizeFromCustomRatio(customRatio, resolution) ||
        resolveOnlineSize("square", resolution)
      );
    }
    return resolveOnlineSize("square", resolution);
  }

  if (opts.ratio === "custom" && customRatio) {
    return (
      sizeFromCustomRatio(customRatio, resolution) ||
      resolveOnlineSize("square", resolution)
    );
  }

  if (opts.size && /^\d+x\d+$/i.test(opts.size) && opts.ratio !== "source") {
    return opts.size;
  }

  const ratio = (opts.ratio || "square") as OnlineRatio;
  if (ratio === "source") {
    return resolveOnlineSize("square", resolution);
  }
  return resolveOnlineSize(ratio, resolution);
}

/** Scale first-image aspect into msWidth/msHeight for a resolution long-side. */
export function msSizeFromRatio(
  customRatio: string,
  resolution: OnlineResolution | string = "1k",
): { width: number; height: number } | null {
  const size = sizeFromCustomRatio(customRatio, resolution);
  if (!size) return null;
  const m = size.match(/^(\d+)x(\d+)$/i);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}
