import { describe, expect, it } from "vitest";
import {
  CONNECT_RULES_SUMMARY,
  canConnect,
  connectRejectCode,
  sanitizeConnections,
  wouldCreateGeneratorCycle,
} from "../../src/features/canvas/core/connectRules";
import { createLegacyNode, type LegacyConnection } from "../../src/features/canvas/core/types";

describe("connectRules", () => {
  const image = createLegacyNode({ kind: "image", id: "img" });
  const prompt = createLegacyNode({ kind: "prompt", id: "pr" });
  const gen = createLegacyNode({ kind: "generator", id: "gen" });
  const comfy = createLegacyNode({ kind: "comfy", id: "cf" });
  const out = createLegacyNode({ kind: "output", id: "out" });
  const llm = createLegacyNode({ kind: "llm", id: "llm" });
  const loop = createLegacyNode({
    kind: "loop",
    id: "loop",
    settings: { showPrompt: true, imageInput: true },
  });

  const nodes = [image, prompt, gen, comfy, out, llm, loop];
  const empty: LegacyConnection[] = [];

  it("exposes rules summary", () => {
    expect(CONNECT_RULES_SUMMARY.length).toBeGreaterThan(3);
  });

  it("allows image/prompt → generator", () => {
    expect(canConnect("img", "gen", nodes, empty)).toBe(true);
    expect(canConnect("pr", "gen", nodes, empty)).toBe(true);
  });

  it("allows generator → output", () => {
    expect(canConnect("gen", "out", nodes, empty)).toBe(true);
  });

  it("allows generator → generator without cycle", () => {
    expect(canConnect("gen", "cf", nodes, empty)).toBe(true);
  });

  it("rejects image → image and generator → prompt", () => {
    expect(connectRejectCode("img", "pr", nodes, empty)).toBe("need_generator");
    expect(connectRejectCode("gen", "pr", nodes, empty)).toBe("generator_target");
  });

  it("rejects self and missing", () => {
    expect(connectRejectCode("gen", "gen", nodes, empty)).toBe("self");
    expect(connectRejectCode("gen", "nope", nodes, empty)).toBe("unknown_node");
  });

  it("allows llm inputs and llm → generator", () => {
    expect(canConnect("pr", "llm", nodes, empty)).toBe(true);
    expect(canConnect("llm", "gen", nodes, empty)).toBe(true);
  });

  it("respects loop port toggles", () => {
    expect(canConnect("img", "loop", nodes, empty)).toBe(true);
    expect(canConnect("pr", "loop", nodes, empty)).toBe(true);
    const closed = createLegacyNode({
      kind: "loop",
      id: "loop2",
      settings: { showPrompt: false, imageInput: false },
    });
    expect(
      canConnect("img", "loop2", [...nodes, closed], empty),
    ).toBe(false);
  });

  it("detects generator cycles", () => {
    const conns: LegacyConnection[] = [
      { id: "c1", from: "gen", to: "cf" },
    ];
    expect(wouldCreateGeneratorCycle("cf", "gen", nodes, conns)).toBe(true);
    expect(canConnect("cf", "gen", nodes, conns)).toBe(false);
  });

  it("sanitizeConnections drops invalid links", () => {
    const bad: LegacyConnection[] = [
      { id: "ok", from: "img", to: "gen" },
      { id: "bad", from: "img", to: "pr" },
    ];
    const cleaned = sanitizeConnections(bad, nodes);
    expect(cleaned.map((c) => c.id)).toEqual(["ok"]);
  });
});
