import { describe, expect, it } from "vitest";
import {
  canRunCascadeParallel,
  cascadeEdgeKey,
  edgeStateForStep,
} from "../../src/features/smart-canvas/core/cascade";

describe("cascade parallel extended", () => {
  const diamond = [
    { nodeId: "a", order: 0, deps: [] },
    { nodeId: "b", order: 1, deps: ["a"] },
    { nodeId: "c", order: 1, deps: ["a"] },
    { nodeId: "d", order: 2, deps: ["b", "c"] },
  ];

  it("parallelizes b and c after a completes", () => {
    const ready = canRunCascadeParallel(diamond, new Set(["a"]), new Set());
    expect(ready.map((s) => s.nodeId).sort()).toEqual(["b", "c"]);
  });

  it("waits for both b and c before d", () => {
    const ready = canRunCascadeParallel(diamond, new Set(["a", "b"]), new Set());
    expect(ready.map((s) => s.nodeId)).toEqual(["c"]);
    const ready2 = canRunCascadeParallel(
      diamond,
      new Set(["a", "b", "c"]),
      new Set(),
    );
    expect(ready2.map((s) => s.nodeId)).toEqual(["d"]);
  });

  it("edgeStateForStep marks done when dependency complete", () => {
    const step = diamond[3];
    const states = edgeStateForStep(
      step,
      new Set(["a", "b", "c"]),
      new Set(),
      new Set(["b", "c"]),
    );
    expect(states["b->d"]).toBe("done");
    expect(states["c->d"]).toBe("done");
  });

  it("cascadeEdgeKey is stable", () => {
    expect(cascadeEdgeKey("x", "y")).toBe("x->y");
    expect(cascadeEdgeKey("", "root")).toBe("->root");
  });

  it("returns empty when all running", () => {
    const ready = canRunCascadeParallel(diamond, new Set(["a"]), new Set(["b", "c"]));
    expect(ready).toHaveLength(0);
  });
});
