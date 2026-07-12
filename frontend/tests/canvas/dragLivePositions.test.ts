import { afterEach, describe, expect, it, vi } from "vitest";
import { connectionPath } from "../../src/features/canvas/core/layout";
import {
  clearDragLivePositions,
  getDragLivePositions,
  nodesWithDragLivePositions,
  setDragLivePositions,
  setDragLivePositionsNow,
  withDragLivePosition,
} from "../../src/features/canvas/core/dragLivePositions";
import type { LegacyNode } from "../../src/features/canvas/core/types";

function node(partial: Partial<LegacyNode> & { id: string; x: number; y: number }): LegacyNode {
  return {
    kind: "image",
    title: partial.id,
    width: 200,
    height: 120,
    ...partial,
  } as LegacyNode;
}

describe("dragLivePositions", () => {
  afterEach(() => {
    clearDragLivePositions();
    vi.unstubAllGlobals();
  });

  it("overrides node x/y for connection endpoints during drag", () => {
    const from = node({ id: "a", x: 0, y: 0 });
    const to = node({ id: "b", x: 400, y: 0 });
    setDragLivePositionsNow({ a: { x: 100, y: 50 } });

    const liveFrom = withDragLivePosition(from);
    const path = connectionPath(liveFrom, to);

    expect(path.x1).toBe(100 + 200);
    expect(path.y1).toBe(50 + 60);
    expect(path.x2).toBe(400);
    expect(path.y2).toBe(60);
  });

  it("keeps mid-edge ports when live position moves a tall generator card", () => {
    const from = node({ id: "img", x: 0, y: 0, width: 200, height: 120 });
    const to = node({
      id: "comfy",
      kind: "comfy",
      x: 300,
      y: 0,
      width: 280,
      height: 320,
    });
    setDragLivePositionsNow({ comfy: { x: 300, y: 80 } });
    const liveTo = withDragLivePosition(to);
    const path = connectionPath(from, liveTo);
    expect(path.x2).toBe(300);
    expect(path.y2).toBe(80 + 160);
  });

  it("applies live positions to multi-select group", () => {
    const nodes = [
      node({ id: "a", x: 10, y: 20 }),
      node({ id: "b", x: 30, y: 40 }),
      node({ id: "c", x: 50, y: 60 }),
    ];
    setDragLivePositionsNow({
      a: { x: 110, y: 120 },
      b: { x: 130, y: 140 },
    });

    const resolved = nodesWithDragLivePositions(nodes);
    expect(resolved[0]).toMatchObject({ id: "a", x: 110, y: 120 });
    expect(resolved[1]).toMatchObject({ id: "b", x: 130, y: 140 });
    expect(resolved[2]).toBe(nodes[2]);
  });

  it("clears live map after commit so store positions win", () => {
    setDragLivePositionsNow({ a: { x: 1, y: 2 } });
    expect(getDragLivePositions().a).toEqual({ x: 1, y: 2 });
    clearDragLivePositions();
    expect(getDragLivePositions()).toEqual({});
  });

  it("batches setDragLivePositions to one rAF notify", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    setDragLivePositions({ a: { x: 1, y: 1 } });
    setDragLivePositions({ a: { x: 2, y: 2 } });
    expect(getDragLivePositions()).toEqual({});
    expect(frames).toHaveLength(1);

    frames[0](0);
    expect(getDragLivePositions()).toEqual({ a: { x: 2, y: 2 } });
  });
});
