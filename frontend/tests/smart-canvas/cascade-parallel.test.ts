import { describe, expect, it } from "vitest";
import {
  canRunCascadeParallel,
  cascadeEdgeKey,
  edgeStateForStep,
} from "../../src/features/smart-canvas/core/cascade";

const steps = [
  { nodeId: "a", order: 0, deps: [] },
  { nodeId: "b", order: 1, deps: ["a"] },
  { nodeId: "c", order: 2, deps: ["b"] },
];

describe("cascade parallel", () => {
  it("canRunCascadeParallel returns ready steps", () => {
    const ready = canRunCascadeParallel(steps, new Set(["a"]), new Set());
    expect(ready.map((s) => s.nodeId)).toEqual(["b"]);
  });

  it("cascadeEdgeKey format", () => {
    expect(cascadeEdgeKey("a", "b")).toBe("a->b");
  });

  it("edgeStateForStep marks running", () => {
    const step = steps[1];
    const states = edgeStateForStep(step, new Set(["a"]), new Set(["b"]), new Set());
    expect(states["a->b"]).toBe("running");
  });
});
