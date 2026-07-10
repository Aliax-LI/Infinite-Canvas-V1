import type { CanvasConnection, SmartNode, ViewportState } from "./types";

export interface HistorySnapshot {
  nodes: SmartNode[];
  connections: CanvasConnection[];
  viewport: ViewportState;
}

export function cloneSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as HistorySnapshot;
}

export function pushUndo(
  stack: HistorySnapshot[],
  snapshot: HistorySnapshot,
  limit: number,
): HistorySnapshot[] {
  const next = [...stack, cloneSnapshot(snapshot)];
  if (next.length > limit) next.shift();
  return next;
}

export function popUndo(
  undoStack: HistorySnapshot[],
  redoStack: HistorySnapshot[],
  current: HistorySnapshot,
): {
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  current: HistorySnapshot | null;
} {
  if (!undoStack.length) {
    return { undoStack, redoStack, current: null };
  }
  const prev = undoStack[undoStack.length - 1];
  return {
    undoStack: undoStack.slice(0, -1),
    redoStack: pushUndo(redoStack, current, 40),
    current: cloneSnapshot(prev),
  };
}

export function popRedo(
  undoStack: HistorySnapshot[],
  redoStack: HistorySnapshot[],
  current: HistorySnapshot,
): {
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  current: HistorySnapshot | null;
} {
  if (!redoStack.length) {
    return { undoStack, redoStack, current: null };
  }
  const next = redoStack[redoStack.length - 1];
  return {
    undoStack: pushUndo(undoStack, current, 40),
    redoStack: redoStack.slice(0, -1),
    current: cloneSnapshot(next),
  };
}
