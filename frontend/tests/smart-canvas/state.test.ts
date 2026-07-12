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

  it("removeNodes multi-select and scrubs group member_ids", () => {
    const store = useSmartCanvasStore.getState();
    store.init({
      canvasId: "del-multi",
      title: "Del",
      icon: "D",
      nodes: [],
      connections: [],
    });
    const a = store.addNode({ kind: "image", x: 0, y: 0 });
    const b = store.addNode({ kind: "loop", x: 10, y: 0 });
    const group = store.addNode({ kind: "group", member_ids: [a.id, b.id] });
    store.updateNode(a.id, { group_id: group.id });
    store.updateNode(b.id, { group_id: group.id });
    store.removeNodes([a.id, b.id]);
    const state = useSmartCanvasStore.getState();
    expect(state.nodes.find((n) => n.id === a.id)).toBeUndefined();
    expect(state.nodes.find((n) => n.id === b.id)).toBeUndefined();
    expect(state.nodes.find((n) => n.id === group.id)?.member_ids ?? []).toEqual([]);
  });

  it("removeNodes is undoable via history", () => {
    const store = useSmartCanvasStore.getState();
    store.init({
      canvasId: "del-undo",
      title: "UndoDel",
      icon: "U",
      nodes: [],
      connections: [],
    });
    const node = store.addNode({ kind: "text" });
    store.removeNodes([node.id]);
    expect(useSmartCanvasStore.getState().nodes).toHaveLength(0);
    store.undo();
    expect(useSmartCanvasStore.getState().nodes.some((n) => n.id === node.id)).toBe(true);
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

  it("ungroupGroup keeps members and clears their group relation", () => {
    const store = useSmartCanvasStore.getState();
    store.init({
      canvasId: "group-test",
      title: "Group",
      icon: "G",
      nodes: [],
      connections: [],
    });
    const member = store.addNode({ kind: "image" });
    const group = store.addNode({ kind: "group", member_ids: [member.id] });
    store.updateNode(member.id, { group_id: group.id });
    store.ungroupGroup(group.id);
    const state = useSmartCanvasStore.getState();
    expect(state.nodes.some((node) => node.id === group.id)).toBe(false);
    expect(state.nodes.find((node) => node.id === member.id)?.group_id).toBeUndefined();
  });

  it("appends imported workflow without replacing the current canvas", () => {
    const store = useSmartCanvasStore.getState();
    store.init({ canvasId: "import", title: "Import", icon: "I", nodes: [], connections: [] });
    const existing = store.addNode({ kind: "image", x: 0, y: 0 });
    store.appendWorkflow(
      [
        { id: "source", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "Source", prompt: "", images: [], settings: {} },
        { id: "target", kind: "image", x: 400, y: 0, width: 280, height: 200, title: "Target", prompt: "", images: [], settings: {} },
      ],
      [{ id: "edge", from: "source", to: "target" }],
      { x: 500, y: 400 },
    );
    const state = useSmartCanvasStore.getState();
    expect(state.nodes).toHaveLength(3);
    expect(state.nodes.some((node) => node.id === existing.id)).toBe(true);
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0].from).not.toBe("source");
    expect(state.connections[0].to).not.toBe("target");
    expect(state.selectedIds).toHaveLength(2);
  });
});
