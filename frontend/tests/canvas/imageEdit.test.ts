import { describe, expect, it } from "vitest";
import {
  clampCropRect,
  clampMaskBrushSize,
  defaultCropRect,
  defaultOutpaintRect,
  fitImageDisplaySize,
  imageEditOutputPoint,
  MASK_BRUSH_DEFAULT,
  MASK_BRUSH_MAX,
  MASK_BRUSH_MIN,
  moveCropRect,
  moveOutpaintImage,
  nextZoomLevel,
  outpaintFromRatio,
  resizeCropRect,
  resizeOutpaintFrame,
  scaleCropRect,
  scaleCropToNatural,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../../src/features/canvas/core/imageEdit";

describe("imageEdit", () => {
  it("scales crop rect to natural pixels", () => {
    const scaled = scaleCropToNatural(
      { x: 10, y: 20, w: 100, h: 80 },
      200,
      160,
      800,
      640,
    );
    expect(scaled.sx).toBe(40);
    expect(scaled.sy).toBe(80);
    expect(scaled.sw).toBe(400);
    expect(scaled.sh).toBe(320);
  });

  it("default crop inset from edges", () => {
    const crop = defaultCropRect(200, 100);
    expect(crop.w).toBeLessThan(200);
    expect(crop.h).toBeLessThan(100);
  });

  it("moves crop rect and clamps to bounds", () => {
    const moved = moveCropRect({ x: 10, y: 10, w: 40, h: 30 }, 200, 200, 100, 80);
    expect(moved.x).toBe(60);
    expect(moved.y).toBe(50);
    expect(moved.w).toBe(40);
    expect(moved.h).toBe(30);

    const clamped = moveCropRect({ x: 10, y: 10, w: 40, h: 30 }, -50, -50, 100, 80);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it("resizes crop from corner handle", () => {
    const next = resizeCropRect(
      { x: 20, y: 20, w: 40, h: 30 },
      "se",
      10,
      10,
      200,
      160,
    );
    expect(next.w).toBe(50);
    expect(next.h).toBe(40);
    expect(next.x).toBe(20);
    expect(next.y).toBe(20);
  });

  it("clampCropRect enforces min size and bounds", () => {
    const next = clampCropRect({ x: -10, y: -10, w: 500, h: 500 }, 100, 80);
    expect(next.w).toBe(100);
    expect(next.h).toBe(80);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it("outpaint frame grows and keeps image inside", () => {
    const base = defaultOutpaintRect(100, 80);
    expect(base).toEqual({ x: 0, y: 0, w: 100, h: 80 });

    const grown = outpaintFromRatio(100, 80, 1.5);
    expect(grown.w).toBe(150);
    expect(grown.h).toBe(120);
    expect(grown.x).toBe(25);
    expect(grown.y).toBe(20);

    const moved = moveOutpaintImage(grown, 100, 100, 100, 80);
    expect(moved.x).toBe(50);
    expect(moved.y).toBe(40);

    const resized = resizeOutpaintFrame(base, "se", 20, 10, 100, 80);
    expect(resized.w).toBe(140);
    expect(resized.h).toBe(100);
  });

  it("scales crop with zoom and clamps zoom levels", () => {
    const scaled = scaleCropRect({ x: 10, y: 10, w: 40, h: 20 }, 2);
    expect(scaled).toEqual({ x: 20, y: 20, w: 80, h: 40 });
    expect(nextZoomLevel(1, 1)).toBeGreaterThan(1);
    expect(nextZoomLevel(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(nextZoomLevel(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
  });

  it("fits natural image into stage max box", () => {
    const fitted = fitImageDisplaySize(4000, 3000, 1300, 840);
    expect(fitted.w).toBeLessThanOrEqual(1300);
    expect(fitted.h).toBeLessThanOrEqual(840);
    expect(fitted.w / fitted.h).toBeCloseTo(4000 / 3000, 1);
  });

  it("places edit output node to the right of source", () => {
    expect(imageEditOutputPoint(100, 50, 220)).toEqual({ x: 356, y: 50 });
  });

  it("clamps mask brush size to history range", () => {
    expect(clampMaskBrushSize(MASK_BRUSH_DEFAULT)).toBe(42);
    expect(clampMaskBrushSize(1)).toBe(MASK_BRUSH_MIN);
    expect(clampMaskBrushSize(999)).toBe(MASK_BRUSH_MAX);
    expect(clampMaskBrushSize(Number.NaN)).toBe(MASK_BRUSH_DEFAULT);
  });
});
