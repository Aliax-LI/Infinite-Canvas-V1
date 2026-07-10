import { describe, expect, it } from "vitest";
import {
  autoArrangeNodes,
  computeNodeBounds,
  fitViewportToBounds,
  isNodeVisible,
} from "../../src/features/smart-canvas/core/layout";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

function node(id: string, x: number, y: number): SmartNode {
  return {
    id,
    kind: "image",
    x,
    y,
    width: 280,
    height: 200,
    title: id,
    prompt: "",
    images: [],
    settings: {},
  };
}

describe("smart-canvas layout extended", () => {
  it("computeNodeBounds empty", () => {
    expect(computeNodeBounds([])).toBeNull();
  });

  it("fitViewportToBounds centers", () => {
    const b = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    const vp = fitViewportToBounds(b, 800, 600);
    expect(vp.scale).toBeGreaterThan(0);
  });

  it("autoArrangeNodes wraps rows", () => {
    const nodes = [node("a", 0, 0), node("b", 0, 0), node("c", 0, 0), node("d", 0, 0)];
    const arranged = autoArrangeNodes(nodes, 2);
    expect(arranged[2].y).toBeGreaterThan(0);
  });

  it("isNodeVisible inside viewport", () => {
    expect(isNodeVisible(node("a", 10, 10), { x: 0, y: 0, scale: 1 }, 800, 600)).toBe(true);
  });

  it("isNodeVisible far outside", () => {
    expect(isNodeVisible(node("a", 5000, 5000), { x: 0, y: 0, scale: 1 }, 800, 600)).toBe(false);
  });
});
