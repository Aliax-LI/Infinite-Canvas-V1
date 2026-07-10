import { describe, expect, it } from "vitest";
import {
  canAutoConnectNodes,
  LEGACY_TYPE_TO_KIND,
  resolveKind,
} from "../../src/features/smart-canvas/core/legacyTypes";
import {
  createLoopNode,
  createPromptNode,
  createSmartGroupNode,
} from "../../src/features/smart-canvas/core/nodeFactory";
import { normalizeNode } from "../../src/features/smart-canvas/core/types";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

function node(kind: string, id = kind): SmartNode {
  return normalizeNode({ id, kind, type: LEGACY_TYPE_TO_KIND[`smart-${kind}`] ?? kind });
}

describe("legacyTypes", () => {
  it("maps legacy smart-prompt type", () => {
    const n = normalizeNode({ id: "1", type: "smart-prompt", text: "hello" });
    expect(n.kind).toBe("prompt");
    expect(n.prompt).toBe("hello");
    expect(n.legacyType).toBe("smart-prompt");
  });

  it("maps legacy smart-loop with settings", () => {
    const n = normalizeNode({
      id: "2",
      type: "smart-loop",
      count: 3,
      mode: "parallel",
    });
    expect(n.kind).toBe("loop");
    expect(n.settings.count).toBe(3);
    expect(n.settings.mode).toBe("parallel");
  });

  it("maps smart-group items to member_ids", () => {
    const n = normalizeNode({
      id: "g",
      type: "smart-group",
      items: ["a", "b"],
    });
    expect(n.kind).toBe("group");
    expect(n.member_ids).toEqual(["a", "b"]);
  });

  it("resolveKind prefers legacy type", () => {
    expect(resolveKind({ type: "smart-image" })).toBe("image");
  });

  it("canAutoConnect prompt to image", () => {
    expect(canAutoConnectNodes(node("prompt"), node("image"))).toBe(true);
  });

  it("canAutoConnect rejects group target", () => {
    expect(canAutoConnectNodes(node("image"), node("group"))).toBe(false);
  });

  it("node factories create correct kinds", () => {
    expect(createPromptNode().kind).toBe("prompt");
    expect(createLoopNode().kind).toBe("loop");
    expect(createSmartGroupNode().kind).toBe("group");
  });
});
