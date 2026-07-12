export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
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
