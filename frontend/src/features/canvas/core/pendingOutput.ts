import type { LegacyConnection, LegacyNode } from "./types";
import { createLegacyNode } from "./types";
import { formatRunDuration } from "./generationLog";

export interface PendingRun {
  id: string;
  startedAt: number;
  prompt?: string;
  nodeKind?: string;
  failed?: boolean;
  error?: string;
}

export interface OutputImageEntry {
  url: string;
  kind?: string;
  runMs?: number;
  name?: string;
}

export function makePendingForRun(
  source: LegacyNode,
  prompt = "",
  startedAt = Date.now(),
): PendingRun {
  return {
    id: crypto.randomUUID(),
    startedAt,
    prompt: prompt || source.prompt,
    nodeKind: source.kind,
  };
}

/** Drop stale in-flight pendings before a new run (keeps failed cards). */
export function pruneActivePending(output: LegacyNode): LegacyNode {
  const list = readPendingList(output);
  const kept = list.filter((p) => p.failed);
  if (kept.length === list.length) return output;
  return {
    ...output,
    settings: {
      ...output.settings,
      _pending: kept,
    },
  };
}

export function readPendingList(node: LegacyNode): PendingRun[] {
  const raw = node.settings?._pending;
  return Array.isArray(raw) ? (raw as PendingRun[]) : [];
}

export function readOutputImages(node: LegacyNode): OutputImageEntry[] {
  const fromSettings = Array.isArray(node.settings?.outputImages)
    ? (node.settings.outputImages as OutputImageEntry[])
    : [];
  if (node.images?.length) {
    const byUrl = new Map(fromSettings.map((img) => [img.url, img]));
    return node.images.map((img) => ({
      url: img.url,
      kind: img.kind,
      name: img.name,
      runMs: byUrl.get(img.url)?.runMs,
    }));
  }
  return fromSettings;
}

export function hasDownstreamGenerator(
  nodeId: string,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
): boolean {
  const runKinds = new Set([
    "generator",
    "msgen",
    "comfy",
    "ltxDirector",
    "video",
    "rh",
  ]);
  for (const c of connections.filter((conn) => conn.from === nodeId)) {
    const target = nodes.find((n) => n.id === c.to);
    if (!target) continue;
    if (runKinds.has(target.kind)) return true;
    if (target.kind === "output") {
      for (const c2 of connections.filter((conn) => conn.from === target.id)) {
        const t2 = nodes.find((n) => n.id === c2.to);
        if (t2 && runKinds.has(t2.kind)) return true;
      }
    }
  }
  return false;
}

/** Fork-first: history `outputForNode` — find or create downstream output node. */
export function outputForNode(
  source: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  dx = 460,
): { output: LegacyNode; nodes: LegacyNode[]; connections: LegacyConnection[] } | null {
  const mediaKinds = new Set(["generator", "msgen", "comfy", "ltxDirector", "rh", "video"]);
  if (!mediaKinds.has(source.kind)) return null;
  if (hasDownstreamGenerator(source.id, nodes, connections)) return null;

  const existing = connections
    .filter((c) => c.from === source.id)
    .map((c) => nodes.find((n) => n.id === c.to))
    .find((n) => n?.kind === "output");

  if (existing) {
    return { output: existing, nodes, connections };
  }

  const output = createLegacyNode({
    kind: "output",
    x: source.x + dx,
    y: source.y,
    title: "Output",
    width: 320,
    height: 280,
    settings: { _pending: [], outputImages: [] },
  });
  const conn = {
    id: crypto.randomUUID(),
    from: source.id,
    to: output.id,
  };
  return {
    output,
    nodes: [...nodes, output],
    connections: [...connections, conn],
  };
}

export function addPendingToOutput(
  output: LegacyNode,
  pending: PendingRun,
): LegacyNode {
  const list = readPendingList(output);
  return {
    ...output,
    settings: {
      ...output.settings,
      _pending: [...list, pending],
    },
  };
}

export function resolvePendingOnOutput(
  output: LegacyNode,
  pendingId: string,
  result: { urls?: string[]; error?: string; runMs?: number; compareRef?: string },
): LegacyNode {
  const pending = readPendingList(output).filter((p) => p.id !== pendingId);
  const images = readOutputImages(output);
  const started = readPendingList(output).find((p) => p.id === pendingId);
  const runMs =
    result.runMs ??
    (started ? Date.now() - Number(started.startedAt || Date.now()) : 0);

  if (result.error) {
    return {
      ...output,
      settings: {
        ...output.settings,
        _pending: [
          ...pending,
          {
            ...(started ?? { id: pendingId, startedAt: Date.now() }),
            id: pendingId,
            failed: true,
            error: result.error,
          },
        ],
        lastError: result.error,
      },
    };
  }

  const newImages = (result.urls ?? []).map((url) => ({
    url,
    kind: "image",
    runMs,
  }));
  const imageComparisons = {
    ...((output.settings?.imageComparisons as Record<string, { url: string }>) ??
      {}),
  };
  if (result.compareRef) {
    for (const url of result.urls ?? []) {
      imageComparisons[url] = { url: result.compareRef };
    }
  }
  return {
    ...output,
    images: [...images, ...newImages].map((img) => ({
      url: img.url,
      kind: img.kind || "image",
      name: img.name,
    })),
    settings: {
      ...output.settings,
      _pending: pending,
      outputImages: [...images, ...newImages],
      ...(result.compareRef ? { imageComparisons } : {}),
    },
  };
}

/** Fork-first: history `outputCompareUrlFor`. */
export function outputCompareUrlFor(url: string, node: LegacyNode): string | null {
  const comps = node.settings?.imageComparisons as
    | Record<string, { url?: string }>
    | undefined;
  const entry = comps?.[url];
  return entry?.url?.trim() || null;
}

export function formatPendingElapsed(pending: PendingRun, now = Date.now()): string {
  const started = Number(pending.startedAt);
  // Reject non-epoch anchors (duration leftovers) — same rule as runElapsedMs.
  if (!Number.isFinite(started) || started < 1_000_000_000_000) {
    return formatRunDuration(0);
  }
  return formatRunDuration(Math.max(0, now - started));
}
