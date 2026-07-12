import { api } from "../../../shared/api/client";
import type { SmartNode } from "./types";

export interface JimengPendingInfo {
  submitId: string;
  kind: "image" | "video" | string;
  queueInfo?: Record<string, unknown>;
  message?: string;
  startedAt?: number;
  updatedAt?: number;
  querying?: boolean;
}

export interface JimengQueryResult {
  status: "succeeded" | "failed" | "pending" | string;
  urls?: string[];
  kind?: string;
  error?: string;
  message?: string;
  queue_info?: Record<string, unknown>;
}

const activePolls = new Set<string>();
const JIMENG_POLL_INTERVAL_MS = 60_000;
const JIMENG_POLL_MAX = 120;

export function jimengQueueText(queueInfo?: Record<string, unknown>): string {
  const idx = queueInfo?.queue_idx;
  const len = queueInfo?.queue_length;
  if (idx != null && len != null) return `即梦云端排队中（第 ${idx}/${len} 位）`;
  return "即梦云端生成中";
}

export function readJimengPending(node: SmartNode | null | undefined): JimengPendingInfo | null {
  const raw = node?.settings?.jimengPending;
  if (!raw || typeof raw !== "object") return null;
  const info = raw as JimengPendingInfo;
  if (!info.submitId) return null;
  return info;
}

export function withJimengPending(
  node: SmartNode,
  signal: JimengPendingInfo,
): Partial<SmartNode> {
  const prev = readJimengPending(node);
  const same = prev?.submitId === signal.submitId ? prev : null;
  return {
    status: "running",
    settings: {
      ...node.settings,
      jimengPending: {
        submitId: signal.submitId,
        kind: signal.kind || same?.kind || "image",
        queueInfo: signal.queueInfo || same?.queueInfo || {},
        message: signal.message || same?.message || "",
        startedAt: same?.startedAt || Date.now(),
        updatedAt: Date.now(),
        querying: false,
      } satisfies JimengPendingInfo,
    },
  };
}

export function clearJimengPending(node: SmartNode): Partial<SmartNode> {
  const next = { ...node.settings };
  delete next.jimengPending;
  return { settings: next };
}

export async function fetchJimengQuery(
  submitId: string,
  kind = "image",
): Promise<JimengQueryResult> {
  return api.post<JimengQueryResult>("/api/jimeng/query-media", {
    submit_id: submitId,
    kind,
  });
}

export type JimengApplyOutcome =
  | { done: true; urls: string[]; kind: string }
  | { done: true; failed: true; error: string }
  | { done: false; queueInfo?: Record<string, unknown>; message?: string };

export function interpretJimengQuery(
  data: JimengQueryResult,
  fallbackKind = "image",
): JimengApplyOutcome {
  const status = String(data.status ?? "").toLowerCase();
  if (status === "succeeded") {
    const urls = (data.urls ?? []).map(String).filter(Boolean);
    return { done: true, urls, kind: data.kind || fallbackKind };
  }
  if (status === "failed") {
    return { done: true, failed: true, error: String(data.error || "即梦任务失败") };
  }
  return {
    done: false,
    queueInfo: data.queue_info,
    message: data.message,
  };
}

/** Background poll — history `startJimengPoll` (60s interval). */
export function startJimengPoll(
  nodeId: string,
  submitId: string,
  options: {
    getNode: (id: string) => SmartNode | undefined;
    onUpdate: (id: string, patch: Partial<SmartNode>) => void;
    onDone: (id: string, urls: string[], kind: string) => void;
    onFail: (id: string, error: string) => void;
    intervalMs?: number;
    maxAttempts?: number;
  },
): void {
  if (!submitId || activePolls.has(submitId)) return;
  activePolls.add(submitId);
  const interval = options.intervalMs ?? JIMENG_POLL_INTERVAL_MS;
  const max = options.maxAttempts ?? JIMENG_POLL_MAX;

  void (async () => {
    try {
      for (let i = 0; i < max; i++) {
        await new Promise((r) => setTimeout(r, interval));
        const cur = options.getNode(nodeId);
        const pending = readJimengPending(cur);
        if (!cur || !pending || pending.submitId !== submitId) return;
        if (pending.querying) continue;
        let data: JimengQueryResult;
        try {
          data = await fetchJimengQuery(submitId, pending.kind || "image");
        } catch {
          continue;
        }
        const outcome = interpretJimengQuery(data, pending.kind || "image");
        if (outcome.done && "failed" in outcome && outcome.failed) {
          options.onFail(nodeId, outcome.error);
          return;
        }
        if (outcome.done && "urls" in outcome) {
          options.onDone(nodeId, outcome.urls, outcome.kind);
          return;
        }
        if (!outcome.done) {
          options.onUpdate(nodeId, {
            settings: {
              ...cur.settings,
              jimengPending: {
                ...pending,
                queueInfo: outcome.queueInfo || pending.queueInfo,
                message: outcome.message || pending.message,
                updatedAt: Date.now(),
              },
            },
          });
        }
      }
    } finally {
      activePolls.delete(submitId);
    }
  })();
}

export function resumeAllJimengPolls(
  nodes: SmartNode[],
  options: Parameters<typeof startJimengPoll>[2],
): number {
  let count = 0;
  for (const node of nodes) {
    const pending = readJimengPending(node);
    if (!pending?.submitId) continue;
    startJimengPoll(node.id, pending.submitId, options);
    count += 1;
  }
  return count;
}
