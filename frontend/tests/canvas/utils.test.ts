import { describe, expect, it } from "vitest";
import { buildLegacyPayload } from "../../src/features/canvas/core/generation";
import { screenToWorld } from "../../src/features/canvas/core/viewport";

describe("legacy canvas utilities", () => {
  it("screenToWorld inverts viewport", () => {
    const p = screenToWorld(100, 100, { left: 0, top: 0, width: 800, height: 600 } as DOMRect, {
      x: 10,
      y: 20,
      scale: 2,
    });
    expect(p.x).toBe(45);
    expect(p.y).toBe(40);
  });

  it("buildLegacyPayload empty refs", () => {
    const p = buildLegacyPayload({ prompt: "a", engine: "api", kind: "image", params: {} });
    expect(p.reference_images).toBeUndefined();
  });
});
