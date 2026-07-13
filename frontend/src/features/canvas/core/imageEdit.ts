export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CropHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
export type OutpaintHandle = "n" | "s" | "e" | "w" | "se";

export const CROP_MIN_SIZE = 24;
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 6;
export const ZOOM_STEP_FACTOR = 1.12;

/** Mask brush diameter in canvas pixels (aligned with history maskBrushSize). */
export const MASK_BRUSH_MIN = 4;
export const MASK_BRUSH_MAX = 160;
export const MASK_BRUSH_DEFAULT = 42;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampMaskBrushSize(size: number): number {
  return Math.round(clamp(Number(size) || MASK_BRUSH_DEFAULT, MASK_BRUSH_MIN, MASK_BRUSH_MAX));
}

export function nextZoomLevel(current: number, direction: 1 | -1): number {
  const next =
    direction > 0 ? current * ZOOM_STEP_FACTOR : current / ZOOM_STEP_FACTOR;
  return clamp(next, ZOOM_MIN, ZOOM_MAX);
}

export function scaleCropRect(crop: CropRect, scale: number): CropRect {
  return {
    x: Math.round(crop.x * scale),
    y: Math.round(crop.y * scale),
    w: Math.max(1, Math.round(crop.w * scale)),
    h: Math.max(1, Math.round(crop.h * scale)),
  };
}

export function clampCropRect(
  crop: CropRect,
  boundsW: number,
  boundsH: number,
  minSize = CROP_MIN_SIZE,
): CropRect {
  const w = clamp(crop.w, minSize, Math.max(minSize, boundsW));
  const h = clamp(crop.h, minSize, Math.max(minSize, boundsH));
  return {
    x: clamp(crop.x, 0, Math.max(0, boundsW - w)),
    y: clamp(crop.y, 0, Math.max(0, boundsH - h)),
    w,
    h,
  };
}

export function moveCropRect(
  crop: CropRect,
  dx: number,
  dy: number,
  boundsW: number,
  boundsH: number,
): CropRect {
  return clampCropRect(
    { ...crop, x: crop.x + dx, y: crop.y + dy },
    boundsW,
    boundsH,
  );
}

export function resizeCropRect(
  crop: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  boundsW: number,
  boundsH: number,
): CropRect {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.w;
  let bottom = crop.y + crop.h;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  const next = {
    x: Math.min(left, right - CROP_MIN_SIZE),
    y: Math.min(top, bottom - CROP_MIN_SIZE),
    w: Math.max(CROP_MIN_SIZE, right - Math.min(left, right - CROP_MIN_SIZE)),
    h: Math.max(CROP_MIN_SIZE, bottom - Math.min(top, bottom - CROP_MIN_SIZE)),
  };
  return clampCropRect(next, boundsW, boundsH);
}

/** Outpaint frame: w/h >= image, x/y = image offset inside the frame. */
export function clampOutpaintRect(
  crop: CropRect,
  imgW: number,
  imgH: number,
): CropRect {
  const w = Math.max(imgW, crop.w);
  const h = Math.max(imgH, crop.h);
  return {
    w,
    h,
    x: clamp(crop.x, 0, Math.max(0, w - imgW)),
    y: clamp(crop.y, 0, Math.max(0, h - imgH)),
  };
}

export function moveOutpaintImage(
  crop: CropRect,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
): CropRect {
  return clampOutpaintRect(
    { ...crop, x: crop.x + dx, y: crop.y + dy },
    imgW,
    imgH,
  );
}

export function resizeOutpaintFrame(
  crop: CropRect,
  handle: OutpaintHandle,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
): CropRect {
  let growX = 0;
  let growY = 0;
  if (handle === "w") growX = -dx;
  else if (handle === "e") growX = dx;
  else if (handle === "n") growY = -dy;
  else if (handle === "s") growY = dy;
  else if (handle === "se") {
    growX = dx;
    growY = dy;
  }
  const nextW = Math.max(imgW, crop.w + growX * 2);
  const nextH = Math.max(imgH, crop.h + growY * 2);
  return clampOutpaintRect(
    {
      w: nextW,
      h: nextH,
      x: crop.x + Math.round((nextW - crop.w) / 2),
      y: crop.y + Math.round((nextH - crop.h) / 2),
    },
    imgW,
    imgH,
  );
}

export function defaultOutpaintRect(imgW: number, imgH: number): CropRect {
  return { x: 0, y: 0, w: Math.max(1, imgW), h: Math.max(1, imgH) };
}

export function outpaintFromRatio(
  imgW: number,
  imgH: number,
  ratio: number,
): CropRect {
  const r = Math.max(1, ratio);
  const w = imgW * r;
  const h = imgH * r;
  return clampOutpaintRect(
    { x: (w - imgW) / 2, y: (h - imgH) / 2, w, h },
    imgW,
    imgH,
  );
}

export function scaleCropToNatural(
  crop: CropRect,
  displayW: number,
  displayH: number,
  naturalW: number,
  naturalH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scaleX = naturalW / Math.max(1, displayW);
  const scaleY = naturalH / Math.max(1, displayH);
  return {
    sx: Math.max(0, Math.round(crop.x * scaleX)),
    sy: Math.max(0, Math.round(crop.y * scaleY)),
    sw: Math.max(1, Math.round(crop.w * scaleX)),
    sh: Math.max(1, Math.round(crop.h * scaleY)),
  };
}

export async function cropImageToBlob(
  img: HTMLImageElement,
  crop: CropRect,
  displayW: number,
  displayH: number,
): Promise<Blob | null> {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const { sx, sy, sw, sh } = scaleCropToNatural(
    crop,
    displayW,
    displayH,
    img.naturalWidth,
    img.naturalHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export async function outpaintImageToBlob(
  img: HTMLImageElement,
  crop: CropRect,
  displayW: number,
  displayH: number,
): Promise<Blob | null> {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const scaleX = img.naturalWidth / Math.max(1, displayW);
  const scaleY = img.naturalHeight / Math.max(1, displayH);
  const outW = Math.max(img.naturalWidth, Math.round(crop.w * scaleX));
  const outH = Math.max(img.naturalHeight, Math.round(crop.h * scaleY));
  const dx = Math.round(crop.x * scaleX);
  const dy = Math.round(crop.y * scaleY);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, dx, dy, img.naturalWidth, img.naturalHeight);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function maskCanvasFromDraw(
  src: HTMLCanvasElement,
): HTMLCanvasElement | null {
  const mask = document.createElement("canvas");
  mask.width = src.width;
  mask.height = src.height;
  const srcCtx = src.getContext("2d");
  const ctx = mask.getContext("2d");
  if (!srcCtx || !ctx) return null;
  const srcData = srcCtx.getImageData(0, 0, src.width, src.height);
  const out = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < srcData.data.length; i += 4) {
    const painted = srcData.data[i + 3] > 8;
    const v = painted ? 255 : 0;
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return mask;
}

export function drawCanvasHasPixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) return true;
  }
  return false;
}

export function defaultCropRect(displayW: number, displayH: number): CropRect {
  const margin = Math.min(displayW, displayH) * 0.1;
  return {
    x: margin,
    y: margin,
    w: Math.max(1, displayW - margin * 2),
    h: Math.max(1, displayH - margin * 2),
  };
}

/** Place a derived IMAGE node to the right of the source (history `imageEditorOutputPoint`). */
export function imageEditOutputPoint(
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  offsetY = 0,
): { x: number; y: number } {
  return {
    x: sourceX + Math.max(1, sourceWidth) + 36,
    y: sourceY + offsetY,
  };
}

/** Fit natural image into stage max box (history crop-canvas max size). */
export function fitImageDisplaySize(
  naturalW: number,
  naturalH: number,
  maxW = 1300,
  maxH = 840,
): { w: number; h: number } {
  if (!naturalW || !naturalH) return { w: 0, h: 0 };
  const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return {
    w: Math.max(1, Math.round(naturalW * scale)),
    h: Math.max(1, Math.round(naturalH * scale)),
  };
}
