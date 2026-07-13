import { describe, expect, it } from "vitest";
import {
  clampLegacyNodeSize,
  isLegacyNodeSized,
  LEGACY_RESIZE_MIN_H,
  LEGACY_RESIZE_MIN_W,
} from "../../src/features/canvas/core/nodeResize";
import { useLegacyCanvasStore } from "../../src/features/canvas/core/state";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import { computeMinimapLayout } from "../../src/features/canvas/core/minimapLayout";

describe("nodeResize", () => {
  it("clamps below history min width/height", () => {
    expect(clampLegacyNodeSize(40, 20)).toEqual({
      width: LEGACY_RESIZE_MIN_W,
      height: LEGACY_RESIZE_MIN_H,
    });
  });

  it("rounds finite sizes above mins", () => {
    expect(clampLegacyNodeSize(401.6, 299.2)).toEqual({
      width: 402,
      height: 299,
    });
  });

  it("detects settings.sized", () => {
    expect(isLegacyNodeSized({})).toBe(false);
    expect(isLegacyNodeSized({ sized: true })).toBe(true);
  });
});

describe("resizeNode persistence", () => {
  it("stores width/height and marks sized so reload keeps custom bounds", () => {
    const node = createLegacyNode({
      id: "n1",
      kind: "prompt",
      width: 310,
      height: 200,
    });
    useLegacyCanvasStore.getState().init({
      canvasId: "c1",
      title: "T",
      nodes: [node],
    });
    useLegacyCanvasStore.getState().resizeNode("n1", 480, 360);
    const next = useLegacyCanvasStore.getState().nodes[0]!;
    expect(next.width).toBe(480);
    expect(next.height).toBe(360);
    expect(next.settings.sized).toBe(true);
    expect(useLegacyCanvasStore.getState().dirty).toBe(true);

    // Re-init from persisted shape (width/height + sized flag).
    useLegacyCanvasStore.getState().init({
      canvasId: "c1",
      title: "T",
      nodes: [next],
    });
    const reloaded = useLegacyCanvasStore.getState().nodes[0]!;
    expect(reloaded.width).toBe(480);
    expect(reloaded.height).toBe(360);
    expect(reloaded.settings.sized).toBe(true);
  });

  it("clamps tiny drag deltas to min size", () => {
    const node = createLegacyNode({ id: "n2", kind: "llm", width: 420, height: 590 });
    useLegacyCanvasStore.getState().init({
      canvasId: "c1",
      title: "T",
      nodes: [node],
    });
    useLegacyCanvasStore.getState().resizeNode("n2", 10, 10);
    const next = useLegacyCanvasStore.getState().nodes[0]!;
    expect(next.width).toBe(LEGACY_RESIZE_MIN_W);
    expect(next.height).toBe(LEGACY_RESIZE_MIN_H);
  });
});

describe("minimap uses resized node bounds", () => {
  it("projects larger footprints for manually resized nodes", () => {
    const view = { x: 0, y: 0, w: 800, h: 600 };
    const defaultNode = { x: 0, y: 0, w: 280, h: 200 };
    const resized = { x: 0, y: 0, w: 520, h: 420 };
    const a = computeMinimapLayout([defaultNode], view, 120, 80);
    const b = computeMinimapLayout([resized], view, 120, 80);
    const pa = a.project(defaultNode);
    const pb = b.project(resized);
    expect(pb.w).toBeGreaterThan(pa.w);
    expect(pb.h).toBeGreaterThan(pa.h);
  });
});
