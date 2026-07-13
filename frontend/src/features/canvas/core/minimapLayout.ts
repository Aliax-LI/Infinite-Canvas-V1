/** Shared minimap projection — mirrors history `minimapBounds` + `updateMinimapViewport`. */

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MinimapProjectedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MinimapLayout {
  bounds: WorldRect;
  scale: number;
  ox: number;
  oy: number;
  view: MinimapProjectedRect;
  project: (r: WorldRect) => MinimapProjectedRect;
}

/** Visible world region for the main canvas viewport transform. */
export function worldViewRect(
  viewport: { x: number; y: number; scale: number },
  containerWidth: number,
  containerHeight: number,
): WorldRect {
  const scale = viewport.scale > 0 ? viewport.scale : 1;
  return {
    x: -viewport.x / scale,
    y: -viewport.y / scale,
    w: containerWidth / scale,
    h: containerHeight / scale,
  };
}

/**
 * Fit node footprints + current view into the minimap so the viewport frame
 * stays on-canvas (history includes `currentWorldViewRect()` in bounds).
 */
export function computeMinimapLayout(
  nodeRects: WorldRect[],
  view: WorldRect,
  mapW: number,
  mapH: number,
): MinimapLayout {
  const rects = nodeRects.length ? [...nodeRects, view] : [view];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1000;
    maxY = 700;
  }
  const pad = Math.max(240, Math.max(maxX - minX, maxY - minY) * 0.08);
  const bounds: WorldRect = {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(1, maxX - minX + pad * 2),
    h: Math.max(1, maxY - minY + pad * 2),
  };
  const scale = Math.min(mapW / bounds.w, mapH / bounds.h);
  const ox = (mapW - bounds.w * scale) / 2;
  const oy = (mapH - bounds.h * scale) / 2;

  const project = (r: WorldRect): MinimapProjectedRect => ({
    x: ox + (r.x - bounds.x) * scale,
    y: oy + (r.y - bounds.y) * scale,
    w: Math.max(3, r.w * scale),
    h: Math.max(3, r.h * scale),
  });

  const projectedView = project(view);
  return {
    bounds,
    scale,
    ox,
    oy,
    project,
    view: {
      ...projectedView,
      w: Math.max(8, projectedView.w),
      h: Math.max(8, projectedView.h),
    },
  };
}
