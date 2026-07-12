import { describe, expect, it } from "vitest";
import {
  buildCascadeOrder,
  canRunCascade,
  getDownstreamNodes,
} from "../../src/features/smart-canvas/core/cascade";
import type { SmartNode, CanvasConnection } from "../../src/features/smart-canvas/core/types";

const nodes: SmartNode[] = [
  { id: "a", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "", prompt: "a", images: [], settings: {} },
  { id: "b", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "", prompt: "b", images: [], settings: {} },
  { id: "c", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "", prompt: "c", images: [], settings: {} },
];

const connections: CanvasConnection[] = [
  { id: "c1", from: "a", to: "b" },
  { id: "c2", from: "b", to: "c" },
];

describe("cascade", () => {
  it("buildCascadeOrder respects topology", () => {
    const steps = buildCascadeOrder(nodes, connections);
    expect(steps[0].nodeId).toBe("a");
    expect(steps[steps.length - 1].nodeId).toBe("c");
  });

  it("buildCascadeOrder from start id", () => {
    const steps = buildCascadeOrder(nodes, connections, "b");
    expect(steps[0].nodeId).toBe("b");
    expect(steps.map((step) => step.nodeId)).toEqual(["b", "c"]);
    expect(steps[0].deps).toEqual([]);
  });

  it("getDownstreamNodes returns descendants", () => {
    const downstream = getDownstreamNodes("a", connections);
    expect(downstream).toContain("b");
    expect(downstream).toContain("c");
  });

  it("canRunCascade picks ready step", () => {
    const steps = buildCascadeOrder(nodes, connections);
    const completed = new Set(["a"]);
    const next = canRunCascade(steps, completed);
    expect(next?.nodeId).toBe("b");
  });

  it("canRunCascade returns null when done", () => {
    const steps = buildCascadeOrder(nodes, connections);
    const completed = new Set(["a", "b", "c"]);
    expect(canRunCascade(steps, completed)).toBeNull();
  });

  it("does not run a node after one of its dependencies fails", () => {
    const steps = buildCascadeOrder(nodes, connections);
    expect(canRunCascade(steps, new Set(["a"]), new Set(["a"]))).toBeNull();
  });
});
