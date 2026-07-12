import { describe, expect, it } from "vitest";
import { buildCameraPreviewTransform } from "../../src/features/tools/shared/angleCameraPreview";

describe("angleCameraPreview", () => {
  it("builds css transform from camera sliders", () => {
    expect(buildCameraPreviewTransform(30, -15, 4)).toBe(
      "rotateY(30deg) rotateX(-15deg) scale(1) translateZ(0px)",
    );
  });

  it("scales up when distance decreases", () => {
    expect(buildCameraPreviewTransform(0, 0, 2)).toContain("scale(2)");
    expect(buildCameraPreviewTransform(0, 0, 8)).toContain("scale(0.5)");
  });
});
