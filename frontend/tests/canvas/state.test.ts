import { describe, expect, it } from "vitest";
import { useLegacyCanvasStore } from "../../src/features/canvas/core/state";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("legacy canvas state", () => {
  it("init loads nodes", () => {
    const node = createLegacyNode({ kind: "image", x: 10, y: 20 });
    useLegacyCanvasStore.getState().init({
      canvasId: "c1",
      title: "Test",
      nodes: [node],
    });
    const s = useLegacyCanvasStore.getState();
    expect(s.nodes).toHaveLength(1);
    expect(s.title).toBe("Test");
  });

  it("moveNode updates position", () => {
    const node = createLegacyNode({ kind: "image" });
    useLegacyCanvasStore.getState().init({ canvasId: "c1", title: "T", nodes: [node] });
    useLegacyCanvasStore.getState().moveNode(node.id, 50, 60);
    expect(useLegacyCanvasStore.getState().nodes[0].x).toBe(50);
  });

  it("addNode marks dirty", () => {
    useLegacyCanvasStore.getState().init({ canvasId: "c1", title: "T", nodes: [] });
    useLegacyCanvasStore.getState().addNode({ kind: "video" });
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(1);
    expect(useLegacyCanvasStore.getState().dirty).toBe(true);
  });

  it("arrangeNodes repositions", () => {
    const a = createLegacyNode({ kind: "image", x: 999, y: 999 });
    useLegacyCanvasStore.getState().init({ canvasId: "c1", title: "T", nodes: [a] });
    useLegacyCanvasStore.getState().arrangeNodes();
    expect(useLegacyCanvasStore.getState().nodes[0].x).toBe(0);
  });
});
