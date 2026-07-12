import { describe, expect, it } from "vitest";
import {
  findLoopCascadeTarget,
  loopCount,
  renderLoopPrompt,
} from "../../src/features/canvas/core/loop";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("loop", () => {
  it("reads loop count from settings", () => {
    expect(loopCount({ count: 5 })).toBe(5);
    expect(loopCount({})).toBe(1);
  });

  it("renders loop prompt with variable substitution", () => {
    const loop = createLegacyNode({
      id: "loop1",
      kind: "loop",
      settings: { showPrompt: true, variablePrompt: "第《计数》轮" },
    });
    const text = renderLoopPrompt(loop, [loop], [], { index: 2, total: 3 });
    expect(text).toBe("第2轮");
  });

  it("finds downstream generator for cascade", () => {
    const loop = createLegacyNode({ id: "loop1", kind: "loop" });
    const gen = createLegacyNode({ id: "gen1", kind: "generator" });
    const connections = [{ id: "c1", from: "loop1", to: "gen1" }];
    expect(findLoopCascadeTarget("loop1", [loop, gen], connections)).toBe("gen1");
  });
});
