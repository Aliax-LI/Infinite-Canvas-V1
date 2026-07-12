import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  connectionPath,
  connectionPathResolved,
  effectiveNodeHeight,
  filterValidConnections,
  nodeInPort,
  nodeOutPort,
  resolvePortPoint,
} from "../../src/features/canvas/core/layout";
import {
  createLegacyNode,
  LEGACY_NODE_H,
  LEGACY_NODE_W,
} from "../../src/features/canvas/core/types";

describe("legacy layout", () => {
  it("connectionPath connects mid-left / mid-right ports", () => {
    const from = createLegacyNode({
      kind: "image",
      x: 0,
      y: 0,
      width: 200,
      height: 120,
    });
    const to = createLegacyNode({
      kind: "comfy",
      x: 400,
      y: 100,
      width: 280,
      height: 320,
    });
    const path = connectionPath(from, to);
    expect(path.x1).toBe(200);
    expect(path.y1).toBe(60);
    expect(path.x2).toBe(400);
    expect(path.y2).toBe(100 + 160);
  });

  it("ports stay vertically centered for every runnable kind height", () => {
    for (const kind of ["generator", "comfy", "rh", "msgen"] as const) {
      const node = createLegacyNode({ kind, x: 10, y: 20, height: 240 });
      expect(nodeInPort(node)).toEqual({ x: 10, y: 20 + 120 });
      expect(nodeOutPort(node).y).toBe(20 + 120);
      expect(nodeOutPort(node).x).toBe(10 + LEGACY_NODE_W);
    }
  });

  it("effective height treats 0 / NaN as LEGACY_NODE_H", () => {
    const zero = createLegacyNode({ kind: "rh", height: 0 });
    zero.height = 0;
    expect(effectiveNodeHeight(zero)).toBe(LEGACY_NODE_H);
    expect(nodeInPort(zero).y).toBe(zero.y + LEGACY_NODE_H / 2);

    const bad = createLegacyNode({ kind: "msgen" });
    bad.height = Number.NaN;
    expect(effectiveNodeHeight(bad)).toBe(LEGACY_NODE_H);
  });

  it("adaptive image height moves in/out ports with the card", () => {
    const tall = createLegacyNode({
      kind: "image",
      x: 0,
      y: 50,
      width: 280,
      height: 400,
    });
    expect(nodeOutPort(tall)).toEqual({ x: 280, y: 50 + 200 });
  });

  it("filterValidConnections drops orphans", () => {
    const a = createLegacyNode({ kind: "image" });
    const conns = filterValidConnections(
      [
        { id: "1", from: a.id, to: "missing" },
        { id: "2", from: a.id, to: a.id },
      ],
      new Set([a.id]),
    );
    expect(conns).toHaveLength(1);
    expect(conns[0].to).toBe(a.id);
  });
});

describe("resolvePortPoint (DOM)", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("uses port element offset within the card when laid out", () => {
    const node = createLegacyNode({
      kind: "comfy",
      id: "c1",
      x: 100,
      y: 200,
      width: 280,
      height: 320,
    });
    const card = document.createElement("div");
    card.setAttribute("data-testid", "legacy-node-c1");
    card.style.left = "100px";
    card.style.top = "200px";
    card.style.position = "absolute";
    Object.defineProperty(card, "offsetWidth", { value: 280 });
    Object.defineProperty(card, "offsetHeight", { value: 320 });

    const port = document.createElement("div");
    port.setAttribute("data-testid", "legacy-port-in-c1");
    Object.defineProperty(port, "offsetLeft", { value: -6 });
    Object.defineProperty(port, "offsetTop", { value: 154 });
    Object.defineProperty(port, "offsetWidth", { value: 12 });
    Object.defineProperty(port, "offsetHeight", { value: 12 });
    card.appendChild(port);
    root.appendChild(card);

    const pt = resolvePortPoint(node, "in");
    expect(pt.x).toBe(100 - 6 + 6);
    expect(pt.y).toBe(200 + 154 + 6);
  });

  it("falls back to geometry when port DOM is missing", () => {
    const node = createLegacyNode({
      kind: "rh",
      id: "missing-dom",
      x: 5,
      y: 10,
      height: 200,
    });
    expect(resolvePortPoint(node, "in")).toEqual(nodeInPort(node));
    expect(connectionPathResolved(node, node).y1).toBe(nodeOutPort(node).y);
  });

  it("follows drag style.left/top on the card", () => {
    const node = createLegacyNode({
      kind: "msgen",
      id: "drag1",
      x: 0,
      y: 0,
      height: 200,
    });
    const card = document.createElement("div");
    card.setAttribute("data-testid", "legacy-node-drag1");
    card.style.left = "40px";
    card.style.top = "60px";
    const port = document.createElement("div");
    port.setAttribute("data-testid", "legacy-port-out-drag1");
    Object.defineProperty(port, "offsetLeft", { value: 274 });
    Object.defineProperty(port, "offsetTop", { value: 94 });
    Object.defineProperty(port, "offsetWidth", { value: 12 });
    Object.defineProperty(port, "offsetHeight", { value: 12 });
    card.appendChild(port);
    root.appendChild(card);

    const pt = resolvePortPoint(node, "out");
    expect(pt.x).toBe(40 + 274 + 6);
    expect(pt.y).toBe(60 + 94 + 6);
  });
});
