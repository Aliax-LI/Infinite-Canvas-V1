import { describe, expect, it } from "vitest";
import { normalizeLegacyNodes } from "../../src/features/canvas/core/types";

describe("normalizeLegacyNodes", () => {
  it("empty array", () => {
    expect(normalizeLegacyNodes([])).toEqual([]);
  });

  it("maps raw objects", () => {
    const nodes = normalizeLegacyNodes([{ id: "1", kind: "video", x: 5 }]);
    expect(nodes[0].id).toBe("1");
    expect(nodes[0].kind).toBe("video");
  });

  it("ignores non-array", () => {
    expect(normalizeLegacyNodes(null)).toEqual([]);
  });
});
