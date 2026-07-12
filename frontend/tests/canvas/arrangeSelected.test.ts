import { describe, expect, it } from "vitest";
import { arrangeSelectedNodes } from "../../src/features/canvas/core/arrangeSelected";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("arrangeSelected", () => {
  it("arranges two connected nodes", () => {
    const a = createLegacyNode({ kind: "image", id: "a", x: 0, y: 0 });
    const b = createLegacyNode({ kind: "generator", id: "b", x: 400, y: 0 });
    const next = arrangeSelectedNodes(
      ["a", "b"],
      [a, b],
      [{ id: "c1", from: "a", to: "b" }],
    );
    expect(next).not.toBeNull();
    const movedA = next!.find((n) => n.id === "a");
    const movedB = next!.find((n) => n.id === "b");
    expect(movedB!.x).toBeGreaterThan(movedA!.x);
  });

  it("returns null for single selection", () => {
    const a = createLegacyNode({ kind: "image", id: "a" });
    expect(arrangeSelectedNodes(["a"], [a], [])).toBeNull();
  });
});
