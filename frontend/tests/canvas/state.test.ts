import { describe, expect, it } from "vitest";
import {
  collectDeleteIds,
  useLegacyCanvasStore,
} from "../../src/features/canvas/core/state";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("collectDeleteIds", () => {
  it("includes group and promptGroup member ids", () => {
    const a = createLegacyNode({ id: "a", kind: "image" });
    const b = createLegacyNode({ id: "b", kind: "prompt" });
    const g = createLegacyNode({
      id: "g",
      kind: "group",
      settings: { items: ["a", "b"] },
    });
    const ids = collectDeleteIds(["g"], [a, b, g]);
    expect([...ids].sort()).toEqual(["a", "b", "g"]);
  });
});

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

  it("copy paste duplicates selection", () => {
    const node = createLegacyNode({ kind: "image", id: "n1" });
    useLegacyCanvasStore.getState().init({ canvasId: "c1", title: "T", nodes: [node] });
    useLegacyCanvasStore.getState().setSelectedIds(["n1"]);
    expect(useLegacyCanvasStore.getState().copySelection()).toBe(true);
    expect(useLegacyCanvasStore.getState().pasteClipboard(50, 50)).toBe(true);
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(2);
  });

  it("undo restores prior nodes", () => {
    const node = createLegacyNode({ kind: "image", id: "n1" });
    useLegacyCanvasStore.getState().init({ canvasId: "c1", title: "T", nodes: [node] });
    useLegacyCanvasStore.getState().setSelectedIds(["n1"]);
    useLegacyCanvasStore.getState().removeNodes(["n1"]);
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(0);
    expect(useLegacyCanvasStore.getState().undo()).toBe(true);
    expect(useLegacyCanvasStore.getState().nodes).toHaveLength(1);
  });
});
