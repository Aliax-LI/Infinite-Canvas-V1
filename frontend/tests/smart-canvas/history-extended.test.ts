import { describe, expect, it } from "vitest";
import {
  cloneSnapshot,
  popRedo,
  popUndo,
  pushUndo,
  type HistorySnapshot,
} from "../../src/features/smart-canvas/core/history";

const snap = (n: number): HistorySnapshot => ({
  nodes: [{ id: `n${n}`, kind: "image", x: n, y: n, width: 280, height: 200, title: "", prompt: "", images: [], settings: {} }],
  connections: [],
  viewport: { x: 0, y: 0, scale: 1 },
});

describe("history stack extended", () => {
  it("pushUndo respects limit", () => {
    let stack: HistorySnapshot[] = [];
    for (let i = 0; i < 5; i++) stack = pushUndo(stack, snap(i), 3);
    expect(stack).toHaveLength(3);
    expect(stack[0].nodes[0].id).toBe("n2");
  });

  it("popUndo restores previous", () => {
    const s0 = snap(0);
    const s1 = snap(1);
    const undo = pushUndo([], s0, 10);
    const result = popUndo(undo, [], s1);
    expect(result.current?.nodes[0].id).toBe("n0");
    expect(result.redoStack).toHaveLength(1);
  });

  it("popUndo empty returns null", () => {
    expect(popUndo([], [], snap(0)).current).toBeNull();
  });

  it("popRedo restores next", () => {
    const s0 = snap(0);
    const s1 = snap(1);
    const redo = pushUndo([], s0, 10);
    const result = popRedo([], redo, s1);
    expect(result.current?.nodes[0].id).toBe("n0");
  });

  it("cloneSnapshot deep copies", () => {
    const a = snap(1);
    const b = cloneSnapshot(a);
    b.nodes[0].x = 999;
    expect(a.nodes[0].x).toBe(1);
  });
});
