import { describe, expect, it } from "vitest";
import {
  buildClipboardFromSelection,
  cloneLegacyNode,
  pasteClipboardAt,
} from "../../src/features/canvas/core/clipboard";
import { createLegacyNode } from "../../src/features/canvas/core/types";

describe("clipboard", () => {
  it("builds clipboard from selection with internal connections", () => {
    const a = createLegacyNode({ kind: "image", id: "a", x: 0, y: 0 });
    const b = createLegacyNode({ kind: "generator", id: "b", x: 100, y: 0 });
    const clip = buildClipboardFromSelection(
      ["a", "b"],
      [a, b],
      [
        { id: "c1", from: "a", to: "b" },
        { id: "c2", from: "b", to: "x" },
      ],
    );
    expect(clip?.nodes).toHaveLength(2);
    expect(clip?.connections).toHaveLength(1);
    expect(clip?.connections[0].from).toBe("a");
  });

  it("paste remaps ids and offsets to anchor", () => {
    const node = createLegacyNode({ kind: "image", id: "n1", x: 10, y: 20 });
    const pasted = pasteClipboardAt(
      { nodes: [node], connections: [] },
      200,
      300,
    );
    expect(pasted.nodes).toHaveLength(1);
    expect(pasted.nodes[0].id).not.toBe("n1");
    expect(pasted.nodes[0].x).toBeGreaterThan(10);
    expect(pasted.selectedIds).toEqual([pasted.nodes[0].id]);
  });

  it("clone clears running flag", () => {
    const node = createLegacyNode({
      kind: "generator",
      settings: { running: true },
    });
    const copy = cloneLegacyNode(node, 5, 5);
    expect(copy.settings.running).toBe(false);
  });
});
