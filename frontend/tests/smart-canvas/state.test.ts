import { describe, expect, it } from "vitest";
import { useSmartCanvasStore } from "../../src/features/smart-canvas/core/state";

describe("smart-canvas store", () => {
  it("init sets canvas state", () => {
    useSmartCanvasStore.getState().init({
      canvasId: "test-1",
      title: "Test",
      icon: "🧩",
      nodes: [],
      connections: [],
    });
    const s = useSmartCanvasStore.getState();
    expect(s.canvasId).toBe("test-1");
    expect(s.title).toBe("Test");
  });

  it("addNode creates node", () => {
    const node = useSmartCanvasStore.getState().addNode({
      kind: "image",
      x: 10,
      y: 20,
    });
    expect(node.kind).toBe("image");
    expect(useSmartCanvasStore.getState().nodes.length).toBeGreaterThan(0);
  });

  it("moveNode updates position", () => {
    const { addNode, moveNode } = useSmartCanvasStore.getState();
    const node = addNode({ kind: "image", x: 0, y: 0 });
    moveNode(node.id, 100, 200);
    const updated = useSmartCanvasStore.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.x).toBe(100);
    expect(updated?.y).toBe(200);
  });

  it("removeNode removes node and connections", () => {
    const store = useSmartCanvasStore.getState();
    const node = store.addNode({ kind: "image" });
    store.addConnection({ id: "c1", from: node.id, to: "other" });
    store.removeNode(node.id);
    expect(useSmartCanvasStore.getState().nodes.find((n) => n.id === node.id)).toBeUndefined();
  });

  it("undo restores previous state", () => {
    useSmartCanvasStore.getState().init({
      canvasId: "undo-test",
      title: "Undo",
      icon: "🧩",
      nodes: [],
      connections: [],
    });
    const store = useSmartCanvasStore.getState();
    store.addNode({ kind: "video" });
    expect(useSmartCanvasStore.getState().nodes.length).toBe(1);
    store.undo();
    expect(useSmartCanvasStore.getState().nodes.length).toBe(0);
  });

  it("setComposer updates engine", () => {
    useSmartCanvasStore.getState().setComposer({ engine: "comfy" });
    expect(useSmartCanvasStore.getState().composer.engine).toBe("comfy");
  });

  it("setViewport updates scale", () => {
    useSmartCanvasStore.getState().setViewport({ scale: 1.5 });
    expect(useSmartCanvasStore.getState().viewport.scale).toBe(1.5);
  });

  it("selectNode sets selected id", () => {
    const node = useSmartCanvasStore.getState().addNode({ kind: "text" });
    useSmartCanvasStore.getState().selectNode(node.id);
    expect(useSmartCanvasStore.getState().selectedNodeId).toBe(node.id);
  });
});
