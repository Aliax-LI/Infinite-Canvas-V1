/** Fork-first from history `addGenerationLog` entry shape. */
export type GenerationLogStatus = "running" | "success" | "failed";

export interface GenerationLogEntry {
  id: string;
  createdAt: number;
  status: GenerationLogStatus;
  platform: string;
  nodeType: string;
  model: string;
  prompt: string;
  outputs: string[];
  runMs: number;
  error: string;
  nodeId?: string;
}

type GenerationLogInput = {
  platform?: string;
  nodeType?: string;
  model?: string;
  prompt?: string;
  outputs?: string[];
  runMs?: number;
  error?: string;
  nodeId?: string;
};

function baseFields(input: GenerationLogInput) {
  return {
    platform: input.platform ?? "-",
    nodeType: input.nodeType ?? "",
    model: input.model ?? "-",
    prompt: input.prompt ?? "",
    nodeId: input.nodeId,
  };
}

/** Final log row (success or failed) — used when no running row exists. */
export function createGenerationLogEntry(input: GenerationLogInput): GenerationLogEntry {
  const error = String(input.error ?? "").trim();
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: error ? "failed" : "success",
    ...baseFields(input),
    outputs: (input.outputs ?? []).filter(Boolean),
    runMs: Math.max(0, Number(input.runMs ?? 0)),
    error,
  };
}

/** Insert at run start so the modal shows in-progress work immediately. */
export function createRunningGenerationLogEntry(input: GenerationLogInput): GenerationLogEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: "running",
    ...baseFields(input),
    outputs: [],
    runMs: 0,
    error: "",
  };
}

export function finalizeGenerationLogEntry(
  entry: GenerationLogEntry,
  input: GenerationLogInput,
): GenerationLogEntry {
  const error = String(input.error ?? "").trim();
  const runMs =
    input.runMs != null
      ? Math.max(0, Number(input.runMs))
      : Math.max(0, Date.now() - entry.createdAt);
  return {
    ...entry,
    status: error ? "failed" : "success",
    outputs: (input.outputs ?? entry.outputs).filter(Boolean),
    runMs,
    error,
    model: input.model ?? entry.model,
    prompt: input.prompt ?? entry.prompt,
  };
}

export function prependGenerationLog(
  logs: GenerationLogEntry[],
  entry: GenerationLogEntry,
  max = 500,
): GenerationLogEntry[] {
  return [entry, ...logs].slice(0, max);
}

export function updateGenerationLogEntry(
  logs: GenerationLogEntry[],
  id: string,
  input: GenerationLogInput,
): GenerationLogEntry[] {
  const idx = logs.findIndex((log) => log.id === id);
  if (idx < 0) return logs;
  const next = [...logs];
  next[idx] = finalizeGenerationLogEntry(logs[idx], input);
  return next;
}

export function resolveRunningLogDuration(
  entry: GenerationLogEntry,
  now = Date.now(),
): number {
  if (entry.status !== "running") return entry.runMs;
  return Math.max(0, now - entry.createdAt);
}

export function formatRunDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

/** Drop stale running rows after reload (run cannot survive page refresh). */
export function normalizePersistedGenerationLogs(
  logs: GenerationLogEntry[],
): GenerationLogEntry[] {
  return logs.map((log) =>
    log.status === "running"
      ? {
          ...log,
          status: "failed" as const,
          error: log.error || "interrupted",
          runMs: resolveRunningLogDuration(log),
        }
      : log,
  );
}
