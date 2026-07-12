import { describe, expect, it } from "vitest";
import {
  defaultCropRect,
  scaleCropToNatural,
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
});
