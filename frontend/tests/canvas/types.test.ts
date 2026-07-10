import { describe, expect, it } from "vitest";
import { normalizeLegacyNode, createLegacyNode } from "../../src/features/canvas/core/types";

describe("legacy types", () => {
  it("createLegacyNode defaults", () => {
    const n = createLegacyNode({ kind: "image" });
    expect(n.kind).toBe("image");
    expect(n.width).toBeGreaterThan(0);
  });

  it("normalizeLegacyNode from raw", () => {
    const n = normalizeLegacyNode({ id: "x", kind: "video", x: 1, y: 2 });
    expect(n.id).toBe("x");
    expect(n.kind).toBe("video");
  });

  it("normalizeLegacyNode empty", () => {
    expect(normalizeLegacyNode(null).kind).toBe("image");
  });
});
