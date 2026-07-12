import { describe, expect, it } from "vitest";
import {
  applyLayoutPatches,
  findAvailableCardPosition,
  layoutPatchesForNullPositions,
} from "../../src/features/canvas-list/autoLayout";
import type { CanvasRecord } from "../../src/types/api";

describe("autoLayout", () => {
  const base: CanvasRecord[] = [
    { id: "a", title: "A", icon: "🧩", kind: "smart", board_x: 10, board_y: 10 },
    { id: "b", title: "B", icon: "🧩", kind: "smart" },
  ];

  it("creates patches only for null positions", () => {
    const patches = layoutPatchesForNullPositions(base);
    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe("b");
    expect(patches[0].board_x).toBeGreaterThan(0);
    expect(patches[0].board_y).toBeGreaterThan(0);
  });

  it("applyLayoutPatches merges coordinates", () => {
    const patches = layoutPatchesForNullPositions(base);
    const merged = applyLayoutPatches(base, patches);
    expect(merged.find((c) => c.id === "b")?.board_x).toBeDefined();
  });

  it("moves a new card away from an occupied requested position", () => {
    const position = findAvailableCardPosition(
      { x: 10, y: 10 },
      [{ id: "a", title: "A", icon: "A", kind: "smart", board_x: 10, board_y: 10 }],
    );
    expect(position).not.toEqual({ x: 10, y: 10 });
    expect(position.x).toBeGreaterThan(10);
  });
});
