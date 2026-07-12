import { describe, expect, it } from "vitest";
import {
  nodeDragWorldOffset,
  nodeDragWorldPosition,
} from "../../src/features/canvas/core/nodeDrag";

describe("nodeDrag", () => {
  it("computes cumulative world offset from pointer delta", () => {
    expect(nodeDragWorldOffset(150, 200, 100, 100, 2)).toEqual({ dx: 25, dy: 50 });
  });

  it("returns origin when pointer has not moved", () => {
    expect(
      nodeDragWorldPosition(10, 20, 100, 100, 100, 100, 1),
    ).toEqual({ x: 10, y: 20 });
  });

  it("adds scaled pointer delta to origin", () => {
    expect(
      nodeDragWorldPosition(10, 20, 130, 160, 100, 100, 2),
    ).toEqual({ x: 25, y: 50 });
  });
});
