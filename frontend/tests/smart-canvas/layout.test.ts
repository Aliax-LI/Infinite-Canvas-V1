import { describe, expect, it } from "vitest";
import {
  autoArrangeNodes,
  computeNodeBounds,
  fitViewportToBounds,
  isNodeVisible,
  screenToWorld,
} from "../../src/features/smart-canvas/core/layout";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

const nodes: SmartNode[] = [
  { id: "1", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "", prompt: "", images: [], settings: {} },
  { id: "2", kind: "image", x: 400, y: 300, width: 280, height: 200, title: "", prompt: "", images: [], settings: {} },
];

describe("layout", () => {
  it("computeNodeBounds returns bounds", () => {
    const b = computeNodeBounds(nodes);
    expect(b?.maxX).toBe(680);
    expect(b?.maxY).toBe(500);
  });

  it("computeNodeBounds returns null for empty", () => {
    expect(computeNodeBounds([])).toBeNull();
  });

  it("fitViewportToBounds produces scale", () => {
    const b = computeNodeBounds(nodes)!;
    const vp = fitViewportToBounds(b, 1000, 800);
    expect(vp.scale).toBeGreaterThan(0);
    expect(vp.scale).toBeLessThanOrEqual(1);
  });

  it("autoArrangeNodes positions in grid", () => {
    const three = [...nodes, { ...nodes[0], id: "3", x: 0, y: 0 }];
    const arranged = autoArrangeNodes(three, 2);
    expect(arranged[1].x).toBeGreaterThan(0);
    expect(arranged[2].y).toBeGreaterThan(0);
  });

  it("isNodeVisible detects visible node", () => {
    const visible = isNodeVisible(nodes[0], { x: 0, y: 0, scale: 1 }, 1000, 800);
    expect(visible).toBe(true);
  });

  it("isNodeVisible hides far node", () => {
    const far: SmartNode = { ...nodes[0], x: 5000, y: 5000 };
    const visible = isNodeVisible(far, { x: 0, y: 0, scale: 1 }, 800, 600);
    expect(visible).toBe(false);
  });

  it("screenToWorld converts coordinates", () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
    const world = screenToWorld(100, 100, rect, { x: 50, y: 50, scale: 2 });
    expect(world.x).toBe(25);
    expect(world.y).toBe(25);
  });
});
