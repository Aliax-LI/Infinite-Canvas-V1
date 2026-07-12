import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  PORT_SNAP_PX,
  nodeIdFromPortElement,
  resolveConnectSnapTarget,
} from "../../src/features/canvas/core/connectHit";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import { isNodeDragSurface, isPortElement } from "../../src/features/canvas/core/nodeInteraction";

describe("connectHit magnetic snap", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("parses node id from port test id", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "legacy-port-in-abc-123");
    expect(nodeIdFromPortElement(el, "in")).toBe("abc-123");
  });

  it("snaps to nearest valid in-port within radius", () => {
    const img = createLegacyNode({ kind: "image", id: "img", x: 0, y: 0 });
    const gen = createLegacyNode({ kind: "generator", id: "gen", x: 400, y: 0 });
    const port = document.createElement("div");
    port.setAttribute("data-testid", "legacy-port-in-gen");
    port.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 100,
        width: 12,
        height: 12,
        right: 112,
        bottom: 112,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    root.appendChild(port);

    const snap = resolveConnectSnapTarget(
      100 + 6 + 20,
      100 + 6,
      "img",
      "out",
      [img, gen],
      [],
      PORT_SNAP_PX,
    );
    expect(snap?.nodeId).toBe("gen");
    expect(snap?.portKind).toBe("in");
  });

  it("does not snap to invalid targets", () => {
    const img = createLegacyNode({ kind: "image", id: "img" });
    const prompt = createLegacyNode({ kind: "prompt", id: "pr" });
    const port = document.createElement("div");
    // prompt has no in-port in UI, but if one existed it must not snap from image→prompt
    port.setAttribute("data-testid", "legacy-port-in-pr");
    port.getBoundingClientRect = () =>
      ({
        left: 50,
        top: 50,
        width: 12,
        height: 12,
        right: 62,
        bottom: 62,
        x: 50,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;
    root.appendChild(port);

    const snap = resolveConnectSnapTarget(
      56,
      56,
      "img",
      "out",
      [img, prompt],
      [],
    );
    expect(snap).toBeNull();
  });
});

describe("port vs node drag surface", () => {
  it("treats enlarged port hit pads as non-drag surfaces", () => {
    const hit = document.createElement("div");
    hit.setAttribute("data-port-hit", "");
    hit.setAttribute("data-testid", "legacy-port-out-n1");
    const inner = document.createElement("span");
    hit.appendChild(inner);
    document.body.appendChild(hit);
    expect(isPortElement(inner)).toBe(true);
    expect(isNodeDragSurface(inner)).toBe(false);
    expect(isNodeDragSurface(hit)).toBe(false);
    hit.remove();
  });
});
