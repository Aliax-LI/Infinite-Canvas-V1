import type { CanvasConnection, SmartNode } from "./types";
import { buildCascadeOrder, canRunCascade, edgeStateForStep, type CascadeEdgeState, type CascadeStep } from "./cascade";
import type { ComposerSettings } from "./types";

export interface CascadeRunnerCallbacks {
  getState: () => {
    nodes: SmartNode[];
    connections: CanvasConnection[];
    composer: ComposerSettings;
  };
  updateNode: (id: string, patch: Partial<SmartNode>) => void;
  setComposer: (patch: Partial<ComposerSettings>) => void;
  submit: (composer: ComposerSettings & { prompt: string }) => Promise<{ url?: string; pending?: boolean; taskId?: string; error?: string }>;
  poll: (taskId: string, maxAttempts: number, intervalMs: number) => Promise<{ url?: string; error?: string }>;
  onEdgeState: (edges: Record<string, CascadeEdgeState>) => void;
  commitHistory: () => void;
}

export interface LoopSettings {
  count: number;
  mode: "serial" | "parallel";
  parallelLimit?: number;
}

export function extractLoopSettings(node: SmartNode): LoopSettings {
  const s = node.settings ?? {};
  return {
    count: Math.max(1, Number(s.count ?? s.loopCount ?? 1)),
    mode: String(s.mode ?? s.loopMode ?? "serial") === "parallel" ? "parallel" : "serial",
    parallelLimit: Number(s.parallelLimit ?? s.smartCascadeParallelLimit ?? 2),
  };
}

export async function runCascade(
  steps: CascadeStep[],
  callbacks: CascadeRunnerCallbacks,
  tailNodeId?: string,
): Promise<{ completed: string[]; errors: string[] }> {
  const completed = new Set<string>();
  const running = new Set<string>();
  const errors = new Set<string>();

  while (true) {
    const step = canRunCascade(steps, completed);
    if (!step) break;

    const { nodes, composer } = callbacks.getState();
    const node = nodes.find((n) => n.id === step.nodeId);
    if (!node) {
      completed.add(step.nodeId);
      continue;
    }

    const loop = node.kind === "loop" ? extractLoopSettings(node) : null;
    const rounds = loop?.count ?? 1;

    for (let round = 0; round < rounds; round++) {
      running.add(step.nodeId);
      callbacks.onEdgeState(edgeStateForStep(step, completed, running, errors));
      callbacks.updateNode(node.id, { status: "running" });

      const prompt = node.prompt || composer.prompt;
      const payload = { ...composer, prompt };
      callbacks.setComposer({ prompt });

      let result = await callbacks.submit(payload);
      if (result.pending && result.taskId) {
        result = await callbacks.poll(result.taskId, 30, 1000);
      }

      running.delete(step.nodeId);

      if (result.url) {
        const existing = node.images ?? [];
        callbacks.updateNode(node.id, {
          images: [...existing, { url: result.url, kind: composer.kind }],
          status: round + 1 >= rounds ? "done" : "running",
        });
      } else {
        callbacks.updateNode(node.id, { status: "error" });
        errors.add(step.nodeId);
        break;
      }

      callbacks.onEdgeState(edgeStateForStep(step, completed, running, errors));
    }

    completed.add(step.nodeId);
    callbacks.onEdgeState(edgeStateForStep(step, completed, running, errors));
  }

  callbacks.commitHistory();
  return {
    completed: [...completed],
    errors: [...errors],
  };
}

export function buildStepsFromTail(
  nodes: SmartNode[],
  connections: CanvasConnection[],
  tailNodeId?: string,
): CascadeStep[] {
  return buildCascadeOrder(nodes, connections, tailNodeId);
}
