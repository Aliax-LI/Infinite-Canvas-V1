import { describe, expect, it } from "vitest";
import {
  cloneSnapshot,
  popRedo,
  popUndo,
  pushUndo,
} from "../../src/features/smart-canvas/core/history";
import type { HistorySnapshot } from "../../src/features/smart-canvas/core/history";

const base: HistorySnapshot = {
  nodes: [{ id: "n1", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "", prompt: "", images: [], settings: {} }],
  connections: [],
  viewport: { x: 0, y: 0, scale: 1 },
};

describe("history", () => {
  it("clones snapshot deeply", () => {
    const clone = cloneSnapshot(base);
    clone.nodes[0].x = 99;
    expect(base.nodes[0].x).toBe(0);
  });

  it("pushUndo respects limit", () => {
    let stack: HistorySnapshot[] = [];
    for (let i = 0; i < 45; i++) {
      stack = pushUndo(stack, base, 40);
    }
    expect(stack.length).toBe(40);
  });

  it("popUndo returns previous state", () => {
    const stack = pushUndo([], base, 40);
    const modified = { ...base, viewport: { x: 10, y: 0, scale: 1 } };
    const result = popUndo(stack, [], modified);
    expect(result.current?.viewport.x).toBe(0);
    expect(result.redoStack.length).toBe(1);
  });

  it("popUndo on empty returns null", () => {
    const result = popUndo([], [], base);
    expect(result.current).toBeNull();
  });

  it("popRedo restores redo state", () => {
    const undoStack = pushUndo([], base, 40);
    const modified = { ...base, viewport: { x: 5, y: 0, scale: 1 } };
    const undone = popUndo(undoStack, [], modified);
    const redone = popRedo(undone.undoStack, undone.redoStack, modified);
    expect(redone.current?.viewport.x).toBe(5);
  });
});
