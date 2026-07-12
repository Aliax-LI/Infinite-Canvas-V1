import type { CanvasConnection, SmartNode } from "./types";

export interface CascadeStep {
  nodeId: string;
  order: number;
  deps: string[];
}

export function buildCascadeOrder(
  nodes: SmartNode[],
  connections: CanvasConnection[],
  startId?: string,
): CascadeStep[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }

  for (const conn of connections) {
    if (!nodeIds.has(conn.from) || !nodeIds.has(conn.to)) continue;
    incoming.get(conn.to)!.add(conn.from);
    outgoing.get(conn.from)!.add(conn.to);
  }

  // A selected node starts an independent branch run. Its upstream nodes are
  // deliberately out of scope, otherwise its original dependencies would
  // make it permanently ineligible to run.
  const scope = new Set<string>();
  if (startId && nodeIds.has(startId)) {
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift()!;
      if (scope.has(id)) continue;
      scope.add(id);
      for (const next of outgoing.get(id) ?? []) queue.push(next);
    }
  } else {
    nodeIds.forEach((id) => scope.add(id));
  }

  const roots = startId && scope.has(startId)
    ? [startId]
    : [...scope].filter((id) => [...(incoming.get(id) ?? [])].every((dep) => !scope.has(dep)));

  const visited = new Set<string>();
  const order: CascadeStep[] = [];
  const queue = [...roots];
  let idx = 0;

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!scope.has(id)) continue;
    order.push({
      nodeId: id,
      order: idx++,
      deps: [...incoming.get(id)!].filter((dep) => scope.has(dep)),
    });
    for (const next of outgoing.get(id) ?? []) {
      if (scope.has(next) && !visited.has(next)) queue.push(next);
    }
  }

  return order;
}

export function getDownstreamNodes(
  nodeId: string,
  connections: CanvasConnection[],
): string[] {
  const result: string[] = [];
  const queue = [nodeId];
  const seen = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    for (const conn of connections) {
      if (conn.from === id && !seen.has(conn.to)) {
        seen.add(conn.to);
        result.push(conn.to);
        queue.push(conn.to);
      }
    }
  }
  return result;
}

export function canRunCascadeParallel(
  steps: CascadeStep[],
  completed: Set<string>,
  running: Set<string>,
): CascadeStep[] {
  return steps.filter(
    (step) =>
      !completed.has(step.nodeId) &&
      !running.has(step.nodeId) &&
      step.deps.every((d) => completed.has(d)),
  );
}

export function cascadeEdgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export type CascadeEdgeState = "idle" | "running" | "done" | "error";

export function edgeStateForStep(
  step: CascadeStep,
  completed: Set<string>,
  running: Set<string>,
  errors: Set<string>,
): Record<string, CascadeEdgeState> {
  const states: Record<string, CascadeEdgeState> = {};
  for (const dep of step.deps) {
    const key = cascadeEdgeKey(dep, step.nodeId);
    if (errors.has(step.nodeId)) states[key] = "error";
    else if (running.has(step.nodeId)) states[key] = "running";
    else if (completed.has(dep)) states[key] = "done";
    else states[key] = "idle";
  }
  return states;
}

export function canRunCascade(
  steps: CascadeStep[],
  completed: Set<string>,
  failed: Set<string> = new Set(),
): CascadeStep | null {
  const ready = canRunCascadeParallel(steps, completed, new Set()).filter(
    (step) => !step.deps.some((dependency) => failed.has(dependency)),
  );
  return ready[0] ?? null;
}
