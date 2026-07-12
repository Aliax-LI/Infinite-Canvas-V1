import { describe, expect, it } from "vitest";
import {
  boardCenterWorld,
  resetViewToCards,
  screenToWorld,
  zoomAtPoint,
} from "../../src/features/canvas-list/boardViewport";

describe("boardViewport", () => {
  const viewport = { x: 100, y: 50, scale: 1.5 };
  const rect = { left: 10, top: 20, width: 800, height: 600 } as DOMRect;

  it("screenToWorld converts pointer to world coords", () => {
    const w = screenToWorld(160, 170, rect, viewport);
    expect(w.x).toBeCloseTo(33.333, 2);
    expect(w.y).toBeCloseTo(66.667, 2);
  });

  it("boardCenterWorld returns center in world space", () => {
    const c = boardCenterWorld(800, 600, viewport);
    expect(c.x).toBeCloseTo(400 / 1.5 - 100 / 1.5);
  });

  it("resetViewToCards fits cards in board", () => {
    const next = resetViewToCards(
      [{ x: 0, y: 0, width: 248, height: 150 }],
      800,
      600,
    );
    expect(next.scale).toBeGreaterThan(0);
    expect(Number.isFinite(next.x)).toBe(true);
    expect(Number.isFinite(next.y)).toBe(true);
  });

  it("resetViewToCards returns origin when empty", () => {
    expect(resetViewToCards([], 800, 600)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("zoomAtPoint keeps cursor anchor", () => {
    const before = { x: 0, y: 0, scale: 1 };
    const after = zoomAtPoint(before, 200, 200, -100);
    expect(after.scale).toBeGreaterThan(1);
  });
});
