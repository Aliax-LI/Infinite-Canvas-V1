import { describe, expect, it } from "vitest";
import {
  computeMinimapLayout,
  worldViewRect,
} from "../../src/features/canvas/core/minimapLayout";

describe("minimapLayout", () => {
  it("maps world view from viewport transform", () => {
    const view = worldViewRect({ x: 100, y: 50, scale: 2 }, 800, 600);
    expect(view).toEqual({ x: -50, y: -25, w: 400, h: 300 });
  });

  it("keeps viewport frame inside map when zoomed out past nodes", () => {
    const nodes = [{ x: 0, y: 0, w: 280, h: 200 }];
    // Large world view (zoomed out) that dwarfs node bounds alone
    const view = { x: -2000, y: -1500, w: 5000, h: 4000 };
    const layout = computeMinimapLayout(nodes, view, 120, 80);

    expect(layout.view.x).toBeGreaterThanOrEqual(-1);
    expect(layout.view.y).toBeGreaterThanOrEqual(-1);
    expect(layout.view.x + layout.view.w).toBeLessThanOrEqual(121);
    expect(layout.view.y + layout.view.h).toBeLessThanOrEqual(81);
    expect(layout.view.w).toBeGreaterThanOrEqual(8);
    expect(layout.view.h).toBeGreaterThanOrEqual(8);
  });

  it("moves viewport frame relative to nodes when zoomed in and panned", () => {
    // Tight cluster; zoomed-in view smaller than node bounds so pan shifts the frame.
    const nodes = [
      { x: 0, y: 0, w: 280, h: 200 },
      { x: 400, y: 0, w: 280, h: 200 },
    ];
    const a = computeMinimapLayout(
      nodes,
      worldViewRect({ x: 0, y: 0, scale: 1 }, 200, 150),
      120,
      80,
    );
    const b = computeMinimapLayout(
      nodes,
      worldViewRect({ x: -300, y: 0, scale: 1 }, 200, 150),
      120,
      80,
    );
    const nodeAx = a.project(nodes[0]!).x;
    const nodeBx = b.project(nodes[0]!).x;
    // Frame position relative to a fixed node should change after pan.
    expect(b.view.x - nodeBx).not.toBeCloseTo(a.view.x - nodeAx, 5);
  });

  it("scales node footprints from actual width/height (not a fixed default)", () => {
    const view = { x: -100, y: -100, w: 2000, h: 1500 };
    const small = { x: 0, y: 0, w: 220, h: 96 };
    const large = { x: 0, y: 0, w: 600, h: 480 };
    const layout = computeMinimapLayout([small, large], view, 120, 80);
    const ps = layout.project(small);
    const pl = layout.project(large);
    expect(pl.w / ps.w).toBeCloseTo(600 / 220, 1);
    expect(pl.h / ps.h).toBeCloseTo(480 / 96, 1);
  });
});
