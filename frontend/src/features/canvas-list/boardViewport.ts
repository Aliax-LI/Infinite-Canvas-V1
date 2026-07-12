/** Board pan/zoom math — ported from history/static/js/canvas-list.js */

export interface BoardViewport {
  x: number;
  y: number;
  scale: number;
}

export const BOARD_MIN_SCALE = 0.3;
export const BOARD_MAX_SCALE = 2;

export function screenToWorld(
  clientX: number,
  clientY: number,
  boardRect: DOMRect,
  viewport: BoardViewport,
): { x: number; y: number } {
  return {
    x: (clientX - boardRect.left - viewport.x) / viewport.scale,
    y: (clientY - boardRect.top - viewport.y) / viewport.scale,
  };
}

export function boardCenterWorld(
  boardWidth: number,
  boardHeight: number,
  viewport: BoardViewport,
): { x: number; y: number } {
  return {
    x: (boardWidth / 2 - viewport.x) / viewport.scale,
    y: (boardHeight / 2 - viewport.y) / viewport.scale,
  };
}

export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resetViewToCards(
  cards: CardBounds[],
  boardWidth: number,
  boardHeight: number,
): BoardViewport {
  if (!cards.length) {
    return { x: 0, y: 0, scale: 1 };
  }
  const bounds = cards.reduce(
    (acc, el) => ({
      minX: Math.min(acc.minX, el.x),
      minY: Math.min(acc.minY, el.y),
      maxX: Math.max(acc.maxX, el.x + el.width),
      maxY: Math.max(acc.maxY, el.y + el.height),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    },
  );
  const padding = boardWidth < 640 ? 20 : 40;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min(
    1,
    (boardWidth - padding * 2) / width,
    (boardHeight - padding * 2) / height,
  );
  const scale =
    boardWidth < 640
      ? 1
      : Math.min(BOARD_MAX_SCALE, Math.max(0.9, fitScale));
  const fitsX = width * scale <= boardWidth - padding * 2;
  const fitsY = height * scale <= boardHeight - padding * 2;
  return {
    scale,
    x: Math.round(
      (fitsX ? (boardWidth - width * scale) / 2 : padding) -
        bounds.minX * scale,
    ),
    y: Math.round(
      (fitsY
        ? Math.max(padding, (boardHeight - height * scale) / 2)
        : padding) - bounds.minY * scale,
    ),
  };
}

export function zoomAtPoint(
  viewport: BoardViewport,
  pointerX: number,
  pointerY: number,
  deltaY: number,
): BoardViewport {
  const wx = (pointerX - viewport.x) / viewport.scale;
  const wy = (pointerY - viewport.y) / viewport.scale;
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  const next = Math.min(
    BOARD_MAX_SCALE,
    Math.max(BOARD_MIN_SCALE, viewport.scale * factor),
  );
  return {
    scale: next,
    x: pointerX - wx * next,
    y: pointerY - wy * next,
  };
}
