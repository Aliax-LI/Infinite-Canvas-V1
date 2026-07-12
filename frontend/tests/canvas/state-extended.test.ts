import { describe, expect, it, beforeEach } from "vitest";
import { useLegacyCanvasStore } from "../../src/features/canvas/core/state";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("legacy canvas connections", () => {
  beforeEach(() => {
    useLegacyCanvasStore.getState().init({
      canvasId: "c1",
      title: "T",
      nodes: [],
      connections: [],
    });
  });

  it("addConnection creates link", () => {
    const a = useLegacyCanvasStore.getState().addNode({ kind: "image" });
    const b = useLegacyCanvasStore.getState().addNode({ kind: "video" });
    const conn = useLegacyCanvasStore.getState().addConnection(a.id, b.id);
    expect(conn).toBeTruthy();
    expect(useLegacyCanvasStore.getState().connections).toHaveLength(1);
  });

  it("prevents self-connection", () => {
    const a = useLegacyCanvasStore.getState().addNode({ kind: "image" });
    expect(useLegacyCanvasStore.getState().addConnection(a.id, a.id)).toBeNull();
  });

  it("removeNode removes connections", () => {
    const a = useLegacyCanvasStore.getState().addNode({ kind: "image" });
    const b = useLegacyCanvasStore.getState().addNode({ kind: "video" });
    useLegacyCanvasStore.getState().addConnection(a.id, b.id);
    useLegacyCanvasStore.getState().removeNode(a.id);
    expect(useLegacyCanvasStore.getState().connections).toHaveLength(0);
  });

  it("completeConnect links nodes", () => {
    const a = useLegacyCanvasStore.getState().addNode({ kind: "comfy" });
    const b = useLegacyCanvasStore.getState().addNode({ kind: "rh" });
    useLegacyCanvasStore.getState().startConnect(a.id);
    useLegacyCanvasStore.getState().completeConnect(b.id);
    expect(useLegacyCanvasStore.getState().connections).toHaveLength(1);
    expect(useLegacyCanvasStore.getState().connectFromId).toBeNull();
  });

  it("completeConnect from in-port reverses direction", () => {
    const gen = useLegacyCanvasStore.getState().addNode({ kind: "generator" });
    const img = useLegacyCanvasStore.getState().addNode({ kind: "image" });
    useLegacyCanvasStore.getState().startConnect(gen.id, "in");
    useLegacyCanvasStore.getState().completeConnect(img.id);
    const conns = useLegacyCanvasStore.getState().connections;
    expect(conns).toHaveLength(1);
    expect(conns[0].from).toBe(img.id);
    expect(conns[0].to).toBe(gen.id);
  });

  it("removeConnection deletes knife target", () => {
    const a = useLegacyCanvasStore.getState().addNode({ kind: "image" });
    const b = useLegacyCanvasStore.getState().addNode({ kind: "generator" });
    const conn = useLegacyCanvasStore.getState().addConnection(a.id, b.id);
    expect(conn).toBeTruthy();
    useLegacyCanvasStore.getState().removeConnection(conn!.id);
    expect(useLegacyCanvasStore.getState().connections).toHaveLength(0);
  });

  it("addNodeAtKind creates typed node", () => {
    const node = useLegacyCanvasStore.getState().addNodeAtKind("prompt", 50, 60);
    expect(node.kind).toBe("prompt");
    expect(node.x).toBe(50);
  });

  it("setSettings marks dirty", () => {
    useLegacyCanvasStore.getState().setSettings({ timeline: { clips: [] } });
    expect(useLegacyCanvasStore.getState().dirty).toBe(true);
    expect(useLegacyCanvasStore.getState().settings.timeline).toBeTruthy();
  });

  it("init loads connections", () => {
    const a = createLegacyNode({ kind: "image" });
    const b = createLegacyNode({ kind: "generator" });
    useLegacyCanvasStore.getState().init({
      canvasId: "c2",
      title: "X",
      nodes: [a, b],
      connections: [{ id: "c1", from: a.id, to: b.id }],
    });
    expect(useLegacyCanvasStore.getState().connections).toHaveLength(1);
  });

  it("init sanitizes invalid connections", () => {
    const a = createLegacyNode({ kind: "image" });
    const b = createLegacyNode({ kind: "prompt" });
    useLegacyCanvasStore.getState().init({
      canvasId: "c3",
      title: "Y",
      nodes: [a, b],
      connections: [{ id: "c-bad", from: a.id, to: b.id }],
    });
    expect(useLegacyCanvasStore.getState().connections).toHaveLength(0);
  });
});
