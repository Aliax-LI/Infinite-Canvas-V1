import { describe, expect, it } from "vitest";
import {
  applyLlmResult,
  beginGenerationOutput,
  finishGenerationOutput,
} from "../../src/features/canvas/core/applyGenerationResult";
import { readPendingList } from "../../src/features/canvas/core/pendingOutput";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import {
  ratioPartsFromDimensions,
  sizeFromCustomRatio,
  resolveGeneratorApiSize,
} from "../../src/features/canvas/core/sourceRatio";

describe("applyGenerationResult", () => {
  it("creates output + pending, then resolves images on finish", () => {
    const t0 = 50_000;
    const gen = createLegacyNode({
      id: "g1",
      kind: "generator",
      x: 0,
      y: 0,
      prompt: "cat",
    });
    const began = beginGenerationOutput(gen, [gen], [], "cat", t0);
    expect(began).not.toBeNull();
    expect(began!.newOutput?.kind).toBe("output");
    expect(began!.newConnection?.from).toBe("g1");
    expect(began!.newConnection?.to).toBe(began!.outputId);
    expect(readPendingList(began!.output)[0]?.startedAt).toBe(t0);

    const finished = finishGenerationOutput(
      gen,
      began!.output,
      began!.pending.id,
      { urls: ["/out/a.png"], url: "/out/a.png" },
      t0,
    );
    expect(readPendingList(finished.output)).toHaveLength(0);
    expect(finished.output.images.map((i) => i.url)).toEqual(["/out/a.png"]);
    expect(finished.source.images[0]?.url).toBe("/out/a.png");
    expect(finished.source.settings.runStartedAt).toBeUndefined();
    expect(finished.source.settings.running).toBe(false);
  });

  it("reuses wired output and still opens a fresh pending slot", () => {
    const t0 = 100_000;
    const gen = createLegacyNode({ id: "g1", kind: "generator", x: 0, y: 0 });
    const out = createLegacyNode({ id: "o1", kind: "output", x: 500, y: 0 });
    const conn = { id: "c1", from: "g1", to: "o1" };
    const began = beginGenerationOutput(gen, [gen, out], [conn], "", t0);
    expect(began?.newOutput).toBeUndefined();
    expect(began?.outputId).toBe("o1");
    expect(readPendingList(began!.output)).toHaveLength(1);
    expect(readPendingList(began!.output)[0].startedAt).toBe(t0);
  });

  it("writes LLM outputText onto the node", () => {
    const llm = createLegacyNode({ id: "l1", kind: "llm" });
    const next = applyLlmResult(llm, { urls: [], outputText: "hello" });
    expect(next.settings.outputText).toBe("hello");
  });

  it("marks output pending failed when finish receives error", () => {
    const gen = createLegacyNode({
      id: "g1",
      kind: "generator",
      prompt: "cat",
    });
    const began = beginGenerationOutput(gen, [gen], [], "cat", 1000);
    expect(began).not.toBeNull();

    const finished = finishGenerationOutput(
      gen,
      began!.output,
      began!.pending.id,
      { error: "上游错误" },
      1000,
    );
    const pending = readPendingList(finished.output);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.failed).toBe(true);
    expect(pending[0]?.error).toBe("上游错误");
    expect(finished.source.settings.lastError).toBe("上游错误");
  });
});

describe("sourceRatio", () => {
  it("approximates 1920x1080 as 16:9", () => {
    const parts = ratioPartsFromDimensions(1920, 1080);
    expect(parts.width / parts.height).toBeCloseTo(16 / 9, 2);
  });

  it("builds pixel size from custom ratio + resolution", () => {
    const size = sizeFromCustomRatio("16:9", "1k");
    expect(size).toMatch(/^\d+x\d+$/);
    const [w, h] = size!.split("x").map(Number);
    expect(w / h).toBeCloseTo(16 / 9, 1);
  });

  it("resolveGeneratorApiSize uses square when source has no refs", async () => {
    const size = await resolveGeneratorApiSize({
      ratio: "source",
      resolution: "1k",
    });
    expect(size).toBe("1024x1024");
  });

  it("resolveGeneratorApiSize uses customRatio for source", async () => {
    const size = await resolveGeneratorApiSize({
      ratio: "source",
      resolution: "1k",
      customRatio: "9:16",
    });
    const [w, h] = size.split("x").map(Number);
    expect(h / w).toBeCloseTo(16 / 9, 1);
  });
});
