/**
 * Apply in-graph generation results onto Output nodes (fork-first history path).
 * History: `outputForNode` → `_pending` → append images / clear pending.
 */
import type { LegacyConnection, LegacyNode } from "./types";
import {
  addPendingToOutput,
  makePendingForRun,
  outputForNode,
  pruneActivePending,
  readPendingList,
  resolvePendingOnOutput,
  type PendingRun,
} from "./pendingOutput";
import type { RunNodeOutcome } from "./runNodeGeneration";
import { clearRunState } from "./runState";

export interface BeginOutputSession {
  outputId: string;
  pending: PendingRun;
  /** All pending slots for this run (count ≥ 1). */
  pendings: PendingRun[];
  /** New output node to insert (undefined if reusing existing). */
  newOutput?: LegacyNode;
  /** New connection to insert (undefined if already linked). */
  newConnection?: LegacyConnection;
  /** Output node after pending was attached (always set). */
  output: LegacyNode;
}

function clampImageCount(count: number): number {
  return Math.max(1, Math.min(8, Number(count) || 1));
}

/** Ensure downstream output + pending slot(s) before API call. */
export function beginGenerationOutput(
  source: LegacyNode,
  nodes: LegacyNode[],
  connections: LegacyConnection[],
  prompt = "",
  startedAt = Date.now(),
  count = 1,
): BeginOutputSession | null {
  const ensured = outputForNode(source, nodes, connections);
  if (!ensured) return null;

  const n = clampImageCount(count);
  const pendings = Array.from({ length: n }, () =>
    makePendingForRun(source, prompt || source.prompt, startedAt),
  );
  const existed = nodes.some((n) => n.id === ensured.output.id);
  const baseOutput = existed
    ? (nodes.find((n) => n.id === ensured.output.id) as LegacyNode)
    : ensured.output;
  let withPending = pruneActivePending(baseOutput);
  for (const pending of pendings) {
    withPending = addPendingToOutput(withPending, pending);
  }

  const newConnection = existed
    ? undefined
    : ensured.connections.find(
        (c) => c.from === source.id && c.to === withPending.id,
      );

  return {
    outputId: withPending.id,
    pending: pendings[0],
    pendings,
    newOutput: existed ? undefined : withPending,
    newConnection,
    output: withPending,
  };
}

/** Resolve pending on output after success/failure; stamp source images / LLM text. */
export function finishGenerationOutput(
  source: LegacyNode,
  output: LegacyNode,
  pendingId: string | string[],
  result: RunNodeOutcome,
  startedAt: number,
): { source: LegacyNode; output: LegacyNode } {
  const runMs = Math.max(0, Date.now() - startedAt);
  const urls = result.urls?.length
    ? result.urls
    : result.url
      ? [result.url]
      : [];
  const ids = Array.isArray(pendingId) ? pendingId : [pendingId];
  const drop = new Set(ids.filter(Boolean));

  let nextOutput = output;
  if (result.error) {
    for (const id of ids) {
      if (!id) continue;
      nextOutput = resolvePendingOnOutput(nextOutput, id, {
        error: result.error,
        runMs,
      });
    }
  } else {
    const primaryId = ids[0] ?? "";
    nextOutput = resolvePendingOnOutput(nextOutput, primaryId, {
      urls,
      runMs,
    });
    if (drop.size > 1) {
      nextOutput = {
        ...nextOutput,
        settings: {
          ...nextOutput.settings,
          _pending: readPendingList(nextOutput).filter((p) => !drop.has(p.id)),
        },
      };
    }
  }

  const nextSource: LegacyNode = {
    ...source,
    images: result.error
      ? source.images
      : urls.map((url) => ({
          url,
          kind: source.kind,
          name: `${source.kind}-out`,
        })),
    settings: {
      ...clearRunState(source.settings),
      ...(result.outputText != null ? { outputText: result.outputText } : {}),
      ...(result.error ? { lastError: result.error } : { lastError: "" }),
      generatedOutputs: result.error
        ? source.settings?.generatedOutputs
        : urls.map((url) => ({ url, kind: source.kind })),
    },
  };

  return { source: nextSource, output: nextOutput };
}

/** LLM has no Output media node — write text onto the node itself. */
export function applyLlmResult(
  source: LegacyNode,
  result: RunNodeOutcome,
): LegacyNode {
  return {
    ...source,
    settings: {
      ...clearRunState(source.settings),
      outputText: result.outputText ?? source.settings?.outputText ?? "",
      ...(result.error ? { lastError: result.error } : { lastError: "" }),
    },
  };
}
