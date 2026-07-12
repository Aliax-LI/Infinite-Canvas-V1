import { describe, expect, it } from "vitest";
import { buildGroupFromSelection } from "../../src/features/canvas/core/groupNodes";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("groupNodes", () => {
  it("groups selected image nodes", () => {
    const img = createLegacyNode({ kind: "image", id: "i1", x: 10, y: 10 });
    const built = buildGroupFromSelection(["i1"], [img], []);
    expect(built?.group.kind).toBe("group");
    expect((built?.group.settings?.items as string[]) ?? []).toContain("i1");
  });

  it("creates promptGroup when only prompts selected", () => {
    const p1 = createLegacyNode({ kind: "prompt", id: "p1", prompt: "one" });
    const p2 = createLegacyNode({ kind: "prompt", id: "p2", prompt: "two" });
    const built = buildGroupFromSelection(["p1", "p2"], [p1, p2], []);
    expect(built?.group.kind).toBe("promptGroup");
    expect((built?.group.settings?.items as string[]) ?? []).toEqual(["p1", "p2"]);
  });
});
