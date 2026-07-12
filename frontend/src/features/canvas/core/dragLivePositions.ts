/**
 * Live node positions during drag (history canvas.js scheduleLinksRender pattern).
 * Kept outside Zustand so pointermove does not re-render the node tree (freeze fix),
 * while ConnectionLayer can still follow wires in real time.
 */
import { useSyncExternalStore } from "react";
import type { LegacyNode } from "./types";

export type DragLiveMap = Record<string, { x: number; y: number }>;

let liveMap: DragLiveMap = {};
let version = 0;
let queued = false;
let rafId = 0;
let pending: DragLiveMap | null = null;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function flush() {
  queued = false;
  rafId = 0;
  if (pending === null) return;
  liveMap = pending;
  pending = null;
  emit();
}

/** Schedule at most one React notify per animation frame (history scheduleLinksRender). */
export function setDragLivePositions(next: DragLiveMap) {
  pending = next;
  if (queued) return;
  queued = true;
  rafId = requestAnimationFrame(flush);
}

/** Immediate publish — used by tests and when a sync read is required. */
export function setDragLivePositionsNow(next: DragLiveMap) {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  queued = false;
  pending = null;
  liveMap = next;
  emit();
}

export function clearDragLivePositions() {
  pending = null;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  queued = false;
  if (Object.keys(liveMap).length === 0) return;
  liveMap = {};
  emit();
}

export function getDragLivePositions(): DragLiveMap {
  return liveMap;
}

export function getDragLiveVersion(): number {
  return version;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDragLivePositions(): DragLiveMap {
  return useSyncExternalStore(subscribe, getDragLivePositions, getDragLivePositions);
}

/** Apply live drag override to a node (immutable shallow copy when needed). */
export function withDragLivePosition(
  node: LegacyNode,
  live: DragLiveMap = liveMap,
): LegacyNode {
  const pos = live[node.id];
  if (!pos) return node;
  if (pos.x === node.x && pos.y === node.y) return node;
  return { ...node, x: pos.x, y: pos.y };
}

export function nodesWithDragLivePositions(
  nodes: LegacyNode[],
  live: DragLiveMap = liveMap,
): LegacyNode[] {
  if (!Object.keys(live).length) return nodes;
  return nodes.map((n) => withDragLivePosition(n, live));
}
