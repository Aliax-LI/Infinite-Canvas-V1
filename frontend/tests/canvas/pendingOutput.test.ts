import { describe, expect, it } from "vitest";
import {
  addPendingToOutput,
  makePendingForRun,
  outputForNode,
  pruneActivePending,
  readPendingList,
  resolvePendingOnOutput,
} from "../../src/features/canvas/core/pendingOutput";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("pendingOutput", () => {
  it("creates or reuses downstream output node", () => {
    const gen = createLegacyNode({ kind: "generator", id: "g1", x: 0, y: 0 });
    const result = outputForNode(gen, [gen], []);
    expect(result).not.toBeNull();
    expect(result!.output.kind).toBe("output");
    expect(result!.connections).toHaveLength(1);
  });

  it("tracks pending and resolves to images", () => {
    const out = createLegacyNode({ kind: "output", id: "o1" });
    const pending = makePendingForRun(createLegacyNode({ kind: "generator" }), "test");
    const withPending = addPendingToOutput(out, pending);
    expect(readPendingList(withPending)).toHaveLength(1);
    const resolved = resolvePendingOnOutput(withPending, pending.id, {
      urls: ["/assets/a.png"],
    });
    expect(readPendingList(resolved)).toHaveLength(0);
    expect(resolved.images).toHaveLength(1);
  });

  it("stores image comparison map when compareRef provided", () => {
    const out = createLegacyNode({ kind: "output", id: "o1" });
    const pending = makePendingForRun(createLegacyNode({ kind: "generator" }), "test");
    const withPending = addPendingToOutput(out, pending);
    const resolved = resolvePendingOnOutput(withPending, pending.id, {
      urls: ["/output/new.png"],
      compareRef: "/output/old.png",
    });
    const comps = resolved.settings.imageComparisons as Record<string, { url: string }>;
    expect(comps["/output/new.png"].url).toBe("/output/old.png");
  });

  it("prunes stale active pendings but keeps failed cards", () => {
    const out = createLegacyNode({
      kind: "output",
      id: "o1",
      settings: {
        _pending: [
          { id: "old", startedAt: 1, failed: false },
          { id: "bad", startedAt: 2, failed: true, error: "x" },
        ],
      },
    });
    const pruned = pruneActivePending(out);
    expect(readPendingList(pruned).map((p) => p.id)).toEqual(["bad"]);
  });
});
