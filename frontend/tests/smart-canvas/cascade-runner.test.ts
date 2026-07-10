import { describe, expect, it, vi } from "vitest";
import { extractLoopSettings, runCascade } from "../../src/features/smart-canvas/core/cascadeRunner";
import { normalizeNode } from "../../src/features/smart-canvas/core/types";
import { buildCascadeOrder } from "../../src/features/smart-canvas/core/cascade";

describe("cascadeRunner", () => {
  it("extracts loop settings", () => {
    const node = normalizeNode({
      id: "l",
      kind: "loop",
      settings: { count: 3, mode: "parallel", parallelLimit: 4 },
    });
    expect(extractLoopSettings(node)).toEqual({
      count: 3,
      mode: "parallel",
      parallelLimit: 4,
    });
  });

  it("runs cascade steps sequentially", async () => {
    const a = normalizeNode({ id: "a", kind: "image" });
    const b = normalizeNode({ id: "b", kind: "image" });
    const steps = buildCascadeOrder([a, b], [{ id: "c", from: "a", to: "b" }]);
    const updates: string[] = [];
    const result = await runCascade(steps, {
      getState: () => ({
        nodes: [a, b],
        connections: [],
        composer: { engine: "api", prompt: "p", kind: "image", params: {} },
      }),
      updateNode: (id, patch) => {
        if (patch.status) updates.push(`${id}:${patch.status}`);
      },
      setComposer: () => {},
      submit: vi.fn().mockResolvedValue({ url: "http://x.png" }),
      poll: vi.fn(),
      onEdgeState: () => {},
      commitHistory: () => {},
    });
    expect(result.completed).toContain("a");
    expect(result.completed).toContain("b");
    expect(updates.some((u) => u.includes("running"))).toBe(true);
  });

  it("records errors on failed submit", async () => {
    const a = normalizeNode({ id: "a", kind: "image" });
    const steps = buildCascadeOrder([a], [], "a");
    const result = await runCascade(steps, {
      getState: () => ({
        nodes: [a],
        connections: [],
        composer: { engine: "api", prompt: "", kind: "image", params: {} },
      }),
      updateNode: () => {},
      setComposer: () => {},
      submit: vi.fn().mockResolvedValue({ error: "fail" }),
      poll: vi.fn(),
      onEdgeState: () => {},
      commitHistory: () => {},
    });
    expect(result.errors).toContain("a");
  });
});
