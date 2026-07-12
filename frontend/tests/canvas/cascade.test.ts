import { describe, expect, it } from "vitest";
import {
  computeCascadeOrder,
  isTerminalGenerator,
  shouldShowCascadeButton,
} from "../../src/features/canvas/core/cascade";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("cascade", () => {
  const image = createLegacyNode({ kind: "image", id: "img" });
  const genA = createLegacyNode({ kind: "generator", id: "ga" });
  const genB = createLegacyNode({ kind: "generator", id: "gb" });
  const nodes = [image, genA, genB];
  const connections = [
    { id: "c1", from: "img", to: "ga" },
    { id: "c2", from: "ga", to: "gb" },
  ];

  it("orders upstream generators before target", () => {
    const order = computeCascadeOrder("gb", nodes, connections);
    expect(order).toEqual(["ga", "gb"]);
  });

  it("detects terminal generator", () => {
    expect(isTerminalGenerator("gb", nodes, connections)).toBe(true);
    expect(isTerminalGenerator("ga", nodes, connections)).toBe(false);
  });

  it("shows cascade button only on terminal with chain", () => {
    expect(shouldShowCascadeButton("gb", nodes, connections)).toBe(true);
    expect(shouldShowCascadeButton("ga", nodes, connections)).toBe(false);
  });
});
