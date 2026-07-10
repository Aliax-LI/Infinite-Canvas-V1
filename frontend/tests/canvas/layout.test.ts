import { describe, expect, it } from "vitest";
import { arrangeGrid, fitViewportToNodes, computeBounds } from "../../src/features/canvas/core/viewport";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("legacy viewport layout", () => {
  it("computeBounds", () => {
    const nodes = [
      createLegacyNode({ kind: "image", x: 0, y: 0 }),
      createLegacyNode({ kind: "image", x: 300, y: 200 }),
    ];
    const b = computeBounds(nodes);
    expect(b?.maxX).toBeGreaterThan(0);
  });

  it("fitViewportToNodes returns scale", () => {
    const nodes = [createLegacyNode({ kind: "image", x: 0, y: 0 })];
    const vp = fitViewportToNodes(nodes, 800, 600);
    expect(vp.scale).toBeGreaterThan(0);
  });

  it("arrangeGrid columns", () => {
    const nodes = [
      createLegacyNode({ kind: "image" }),
      createLegacyNode({ kind: "image" }),
      createLegacyNode({ kind: "image" }),
      createLegacyNode({ kind: "image" }),
    ];
    const arranged = arrangeGrid(nodes, 2);
    expect(arranged[2].x).toBe(0);
    expect(arranged[2].y).toBeGreaterThan(0);
  });
});
