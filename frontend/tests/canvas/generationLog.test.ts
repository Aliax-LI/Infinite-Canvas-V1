import { describe, expect, it } from "vitest";
import {
  createGenerationLogEntry,
  createRunningGenerationLogEntry,
  finalizeGenerationLogEntry,
  formatRunDuration,
  normalizePersistedGenerationLogs,
  prependGenerationLog,
  resolveRunningLogDuration,
  updateGenerationLogEntry,
} from "../../src/features/canvas/core/generationLog";

describe("generationLog", () => {
  it("creates success entry", () => {
    const entry = createGenerationLogEntry({
      platform: "generator",
      prompt: "hello",
      outputs: ["/output/a.png"],
      runMs: 1200,
    });
    expect(entry.status).toBe("success");
    expect(entry.outputs).toHaveLength(1);
  });

  it("creates failed entry", () => {
    const entry = createGenerationLogEntry({ error: "boom" });
    expect(entry.status).toBe("failed");
    expect(entry.error).toBe("boom");
  });

  it("creates running entry at start", () => {
    const entry = createRunningGenerationLogEntry({
      platform: "generator",
      prompt: "in flight",
    });
    expect(entry.status).toBe("running");
    expect(entry.runMs).toBe(0);
    expect(entry.outputs).toEqual([]);
    expect(entry.error).toBe("");
  });

  it("finalizes running entry on success", () => {
    const running = createRunningGenerationLogEntry({ prompt: "a" });
    const done = finalizeGenerationLogEntry(running, {
      outputs: ["/out.png"],
      runMs: 1500,
    });
    expect(done.id).toBe(running.id);
    expect(done.status).toBe("success");
    expect(done.outputs).toEqual(["/out.png"]);
    expect(done.runMs).toBe(1500);
  });

  it("finalizes running entry on failure", () => {
    const running = createRunningGenerationLogEntry({ prompt: "a" });
    const done = finalizeGenerationLogEntry(running, {
      error: "timeout",
      runMs: 900,
    });
    expect(done.status).toBe("failed");
    expect(done.error).toBe("timeout");
  });

  it("updates running entry in place by id", () => {
    const running = createRunningGenerationLogEntry({ prompt: "a" });
    const logs = prependGenerationLog([], running);
    const next = updateGenerationLogEntry(logs, running.id, {
      outputs: ["/x.png"],
      runMs: 2000,
    });
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("success");
    expect(next[0].id).toBe(running.id);
  });

  it("prepends with cap", () => {
    const a = createGenerationLogEntry({ prompt: "a" });
    const b = createGenerationLogEntry({ prompt: "b" });
    const next = prependGenerationLog([a], b, 1);
    expect(next).toHaveLength(1);
    expect(next[0].prompt).toBe("b");
  });

  it("formats duration", () => {
    expect(formatRunDuration(500)).toContain("ms");
    expect(formatRunDuration(2500)).toContain("s");
    expect(formatRunDuration(115_000)).toBe("1m 55s");
  });

  it("resolves live elapsed for running entries", () => {
    const running = createRunningGenerationLogEntry({ prompt: "live" });
    running.createdAt = Date.now() - 3000;
    expect(resolveRunningLogDuration(running, running.createdAt + 3000)).toBe(3000);
  });

  it("normalizes stale running logs after reload", () => {
    const running = createRunningGenerationLogEntry({ prompt: "stale" });
    running.createdAt = Date.now() - 5000;
    const next = normalizePersistedGenerationLogs([running]);
    expect(next[0].status).toBe("failed");
    expect(next[0].error).toBe("interrupted");
    expect(next[0].runMs).toBeGreaterThan(0);
  });
});
