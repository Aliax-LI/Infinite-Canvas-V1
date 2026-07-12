import { describe, expect, it, vi, afterEach } from "vitest";
import {
  clearRunState,
  normalizePersistedCanvasNodes,
  runElapsedMs,
  stampRunStart,
} from "../../src/features/canvas/core/runState";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import { readPendingList } from "../../src/features/canvas/core/pendingOutput";

describe("runState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears runStartedAt when a run finishes", () => {
    const cleared = clearRunState({
      running: true,
      runStartedAt: 1_000,
      model: "m",
    });
    expect(cleared.running).toBe(false);
    expect(cleared.runStartedAt).toBeUndefined();
    expect(cleared.model).toBe("m");
  });

  it("resets elapsed to zero on a fresh run start", () => {
    const t0 = 10_000;
    const t1 = 40_000;
    vi.spyOn(Date, "now").mockReturnValue(t1);

    const afterFirst = clearRunState({
      running: true,
      runStartedAt: t0,
    });
    const secondRun = stampRunStart(afterFirst, t1);

    expect(runElapsedMs(secondRun, true, t1)).toBe(0);
    expect(runElapsedMs(secondRun, true, t1 + 2500)).toBe(2500);
  });

  it("does not count elapsed when not running", () => {
    expect(
      runElapsedMs({ runStartedAt: Date.now() - 5000 }, false, Date.now()),
    ).toBe(0);
  });

  it("normalizePersistedCanvasNodes clears stale running and pending", () => {
    const gen = createLegacyNode({
      id: "g1",
      kind: "generator",
      settings: { running: true, runStartedAt: 1 },
    });
    const out = createLegacyNode({
      id: "o1",
      kind: "output",
      settings: {
        _pending: [{ id: "p1", startedAt: 1 }],
      },
    });
    const next = normalizePersistedCanvasNodes([gen, out]);
    expect(next[0].settings?.running).toBe(false);
    expect(next[0].settings?.runStartedAt).toBeUndefined();
    const pending = readPendingList(next[1]);
    expect(pending[0]?.failed).toBe(true);
    expect(pending[0]?.error).toBe("interrupted");
  });
});
