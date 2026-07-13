/** Per-run timing on generator nodes (`settings.runStartedAt`). */

import type { LegacyNode } from "./types";
import type { PendingRun } from "./pendingOutput";
import { readPendingList } from "./pendingOutput";

/** Wall-clock epoch ms are ~1e12+; smaller values are not valid start anchors. */
const MIN_EPOCH_MS = 1_000_000_000_000;

export function stampRunStart(
  settings: Record<string, unknown> | undefined,
  startedAt: number,
): Record<string, unknown> {
  return {
    ...settings,
    running: true,
    runStartedAt: startedAt,
  };
}

/** Clear running flag and drop elapsed anchor so the next run starts at 0. */
export function clearRunState(
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...(settings ?? {}), running: false };
  delete next.runStartedAt;
  return next;
}

/**
 * Live elapsed ms. Rejects non-epoch anchors (e.g. leftover duration like 10000)
 * so a stale `runStartedAt` cannot paint as ~10.0s on a fresh run.
 */
export function runElapsedMs(
  settings: Record<string, unknown> | undefined,
  running: boolean,
  now = Date.now(),
): number {
  if (!running) return 0;
  const started = Number(settings?.runStartedAt);
  if (!Number.isFinite(started) || started < MIN_EPOCH_MS) return 0;
  return Math.max(0, now - started);
}

/** Drop in-flight flags after reload — runs cannot survive page refresh. */
export function normalizePersistedRunSettings(
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = clearRunState(settings);
  delete next.lastError;
  return next;
}

function normalizeOutputPending(
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const list = readPendingList({ settings } as LegacyNode);
  if (!list.length) return settings ?? {};
  const kept: PendingRun[] = list.map((p) =>
    p.failed
      ? p
      : {
          ...p,
          failed: true,
          error: p.error || "interrupted",
        },
  );
  return { ...(settings ?? {}), _pending: kept };
}

/** Sanitize nodes loaded from persistence (stale running / pending). */
export function normalizePersistedCanvasNodes(nodes: LegacyNode[]): LegacyNode[] {
  const runKinds = new Set([
    "generator",
    "comfy",
    "video",
    "msgen",
    "llm",
    "rh",
    "ltxDirector",
  ]);
  return nodes.map((node) => {
    let settings = node.settings ?? {};
    if (runKinds.has(node.kind)) {
      // Always drop orphan anchors, even if `running` was cleared without stamp cleanup.
      if (settings.running || settings.runStartedAt != null) {
        settings = normalizePersistedRunSettings(settings);
      }
    }
    if (node.kind === "output") {
      settings = normalizeOutputPending(settings);
    }
    if (settings === node.settings) return node;
    return { ...node, settings };
  });
}
