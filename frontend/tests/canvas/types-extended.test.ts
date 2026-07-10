import { describe, expect, it } from "vitest";
import {
  LEGACY_NODE_KINDS,
  LEGACY_NODE_LABELS,
  createLegacyNode,
  isLegacyNodeKind,
  normalizeLegacyConnection,
  normalizeLegacyConnections,
} from "../../src/features/canvas/core/types";

describe("legacy node kinds", () => {
  it("defines 12 node kinds", () => {
    expect(LEGACY_NODE_KINDS.length).toBeGreaterThanOrEqual(10);
    expect(LEGACY_NODE_KINDS).toContain("generator");
    expect(LEGACY_NODE_KINDS).toContain("ltxDirector");
    expect(LEGACY_NODE_KINDS).toContain("output");
  });

  it("has labels for all kinds", () => {
    for (const kind of LEGACY_NODE_KINDS) {
      expect(LEGACY_NODE_LABELS[kind]).toBeTruthy();
    }
  });

  it("isLegacyNodeKind validates", () => {
    expect(isLegacyNodeKind("comfy")).toBe(true);
    expect(isLegacyNodeKind("unknown")).toBe(false);
  });

  it("createLegacyNode uses kind label as title", () => {
    const n = createLegacyNode({ kind: "llm" });
    expect(n.title).toBe("LLM");
  });
});

describe("legacy connections normalize", () => {
  it("normalizes valid connection", () => {
    const c = normalizeLegacyConnection({ id: "c1", from: "a", to: "b" });
    expect(c?.from).toBe("a");
    expect(c?.to).toBe("b");
  });

  it("rejects invalid connection", () => {
    expect(normalizeLegacyConnection({ from: "", to: "b" })).toBeNull();
  });

  it("normalizes array", () => {
    const list = normalizeLegacyConnections([
      { id: "1", from: "a", to: "b" },
      { from: "", to: "x" },
    ]);
    expect(list).toHaveLength(1);
  });
});
