import { describe, expect, it } from "vitest";
import {
  buildCascadeOrder,
  getDownstreamNodes,
  canRunCascadeParallel,
  edgeStateForStep,
} from "../../src/features/smart-canvas/core/cascade";
import type { CanvasConnection, SmartNode } from "../../src/features/smart-canvas/core/types";

function n(id: string): SmartNode {
  return { id, kind: "image", x: 0, y: 0, width: 280, height: 200, title: id, prompt: "", images: [], settings: {} };
}

describe("cascade extended", () => {
  const nodes = [n("a"), n("b"), n("c")];
  const connections: CanvasConnection[] = [
    { id: "1", from: "a", to: "b" },
    { id: "2", from: "b", to: "c" },
  ];

  it("buildCascadeOrder topological", () => {
    const order = buildCascadeOrder(nodes, connections);
    expect(order.map((s) => s.nodeId)).toEqual(["a", "b", "c"]);
  });

  it("buildCascadeOrder from startId", () => {
    const order = buildCascadeOrder(nodes, connections, "b");
    expect(order[0].nodeId).toBe("b");
  });

  it("getDownstreamNodes", () => {
    expect(getDownstreamNodes("a", connections)).toEqual(["b", "c"]);
  });

  it("canRunCascadeParallel next ready", () => {
    const steps = buildCascadeOrder(nodes, connections);
    const ready = canRunCascadeParallel(steps, new Set(["a"]), new Set());
    expect(ready.map((s) => s.nodeId)).toEqual(["b"]);
  });

  it("edgeStateForStep marks done dep", () => {
    const step = { nodeId: "b", order: 1, deps: ["a"] };
    const states = edgeStateForStep(step, new Set(["a", "b"]), new Set(), new Set());
    expect(states["a->b"]).toBe("done");
  });
});
