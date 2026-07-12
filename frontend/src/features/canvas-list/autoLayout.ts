import type { CanvasRecord } from "../../types/api";

/** Grid layout for canvases missing board position — mirrors history canvas-list.js */
const X0 = 40;
const Y0 = 40;
const XSTRIDE = 276;
const YSTRIDE = 176;
const COLS = 4;
const CARD_W = 248;
const CARD_H = 148;
const GAP = 28;

export interface LayoutPatch {
  id: string;
  board_x: number;
  board_y: number;
}

export function findAvailableCardPosition(
  desired: { x: number; y: number },
  canvases: CanvasRecord[],
): { x: number; y: number } {
  const occupied = canvases
    .filter((canvas) => canvas.board_x != null && canvas.board_y != null)
    .map((canvas) => ({ x: Number(canvas.board_x), y: Number(canvas.board_y) }));
  const collides = (candidate: { x: number; y: number }) =>
    occupied.some(
      (item) =>
        candidate.x < item.x + CARD_W + GAP &&
        candidate.x + CARD_W + GAP > item.x &&
        candidate.y < item.y + CARD_H + GAP &&
        candidate.y + CARD_H + GAP > item.y,
    );
  for (let index = 0; index < 200; index += 1) {
    const candidate = {
      x: desired.x + (index % COLS) * XSTRIDE,
      y: desired.y + Math.floor(index / COLS) * YSTRIDE,
    };
    if (!collides(candidate)) return candidate;
  }
  return {
    x: desired.x,
    y: desired.y + Math.ceil(occupied.length / COLS) * YSTRIDE,
  };
}

export function layoutPatchesForNullPositions(
  canvases: CanvasRecord[],
): LayoutPatch[] {
  const positioned = canvases.filter(
    (c) => c.board_x != null && c.board_y != null,
  );
  const nulls = canvases.filter(
    (c) => c.board_x == null || c.board_y == null,
  );
  let i = positioned.length;
  const patches: LayoutPatch[] = [];
  for (const c of nulls) {
    const col = i % COLS;
    const rowIdx = Math.floor(i / COLS);
    patches.push({
      id: c.id,
      board_x: X0 + col * XSTRIDE,
      board_y: Y0 + rowIdx * YSTRIDE,
    });
    i += 1;
  }
  return patches;
}

export function applyLayoutPatches(
  canvases: CanvasRecord[],
  patches: LayoutPatch[],
): CanvasRecord[] {
  if (!patches.length) return canvases;
  const byId = new Map(patches.map((p) => [p.id, p]));
  return canvases.map((c) => {
    const patch = byId.get(c.id);
    if (!patch) return c;
    return { ...c, board_x: patch.board_x, board_y: patch.board_y };
  });
}
