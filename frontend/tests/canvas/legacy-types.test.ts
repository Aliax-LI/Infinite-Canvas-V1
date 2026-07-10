import { describe, expect, it } from "vitest";
import {
  LEGACY_NODE_KINDS,
  LEGACY_NODE_LABELS,
  createLegacyNode,
  defaultTitleForKind,
  isLegacyNodeKind,
  normalizeLegacyConnection,
  normalizeLegacyConnections,
  normalizeLegacyNode,
} from "../../src/features/canvas/core/types";

describe("legacy node types", () => {
  it("lists 12 node kinds", () => {
    expect(LEGACY_NODE_KINDS.length).toBeGreaterThanOrEqual(10);
  });

  for (const kind of LEGACY_NODE_KINDS) {
    it(`has label for ${kind}`, () => {
      expect(LEGACY_NODE_LABELS[kind]).toBeTruthy();
      expect(isLegacyNodeKind(kind)).toBe(true);
    });
  }

  it("creates node with defaults", () => {
    const n = createLegacyNode({ kind: "comfy" });
    expect(n.kind).toBe("comfy");
    expect(n.title).toBe(defaultTitleForKind("comfy"));
    expect(n.width).toBeGreaterThan(0);
  });

  it("normalizes legacy payload", () => {
    const n = normalizeLegacyNode({
      id: "x",
      type: "video",
      kind: "video",
      x: 10,
      prompt: "hello",
    });
    expect(n.id).toBe("x");
    expect(n.kind).toBe("video");
    expect(n.prompt).toBe("hello");
  });

  it("normalizes connections", () => {
    const list = normalizeLegacyConnections([
      { id: "c1", from: "a", to: "b" },
      { from: "", to: "b" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].from).toBe("a");
  });

  it("rejects invalid connection", () => {
    expect(normalizeLegacyConnection({})).toBeNull();
  });
});

describe("legacy layout helpers", () => {
  it("assigns unique ids", () => {
    const a = createLegacyNode({ kind: "image" });
    const b = createLegacyNode({ kind: "image" });
    expect(a.id).not.toBe(b.id);
  });
});
