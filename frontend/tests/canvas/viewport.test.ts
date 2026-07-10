import { describe, expect, it } from "vitest";
import {
  computeBounds,
  fitViewportToNodes,
  panViewport,
  zoomViewport,
  arrangeGrid,
  clampScale,
} from "../../src/features/canvas/core/viewport";
import { createLegacyNode, normalizeLegacyNode } from "../../src/features/canvas/core/types";
import { buildLegacyPayload } from "../../src/features/canvas/core/generation";

describe("legacy canvas viewport", () => {
  it("fitViewportToNodes centers content", () => {
    const nodes = [
      createLegacyNode({ kind: "image", x: 100, y: 100 }),
      createLegacyNode({ kind: "image", x: 500, y: 400 }),
    ];
    const vp = fitViewportToNodes(nodes, 1000, 800);
    expect(vp.scale).toBeGreaterThan(0);
    expect(vp.scale).toBeLessThanOrEqual(1);
  });

  it("panViewport offsets x/y", () => {
    const vp = panViewport({ x: 10, y: 20, scale: 1 }, 5, -3);
    expect(vp).toEqual({ x: 15, y: 17, scale: 1 });
  });

  it("zoomViewport clamps scale", () => {
    expect(zoomViewport({ x: 0, y: 0, scale: 0.1 }, -0.5).scale).toBe(0.2);
    expect(clampScale(5)).toBe(3);
  });

  it("arrangeGrid places nodes in columns", () => {
    const nodes = [1, 2, 3, 4].map((i) =>
      createLegacyNode({ kind: "image", id: String(i), x: 0, y: 0 }),
    );
    const arranged = arrangeGrid(nodes, 2);
    expect(arranged[1].x).toBeGreaterThan(0);
    expect(arranged[2].y).toBeGreaterThan(0);
  });

  it("computeBounds returns null for empty", () => {
    expect(computeBounds([])).toBeNull();
  });
});

describe("legacy canvas types", () => {
  it("normalizeLegacyNode fills defaults", () => {
    const node = normalizeLegacyNode({ id: "x", kind: "video" });
    expect(node.id).toBe("x");
    expect(node.kind).toBe("video");
    expect(node.width).toBeGreaterThan(0);
  });

  it("buildLegacyPayload includes refs", () => {
    const payload = buildLegacyPayload(
      { prompt: "test", engine: "api", kind: "image", params: {} },
      ["http://a"],
    );
    expect(payload.reference_images).toEqual(["http://a"]);
  });
});
