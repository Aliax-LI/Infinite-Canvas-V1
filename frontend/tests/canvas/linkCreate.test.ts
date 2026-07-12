import { describe, expect, it } from "vitest";
import {
  createLinkedNodeAt,
  linkCreateOptions,
  shouldAutoCreateOutputOnDrag,
} from "../../src/features/canvas/core/linkCreate";
import { createLegacyNode, type LegacyConnection, type LegacyNode } from "../../src/features/canvas/core/types";
import {
  isNodeControl,
  isNodeDragSurface,
} from "../../src/features/canvas/core/nodeInteraction";
import { nodeIdFromPortElement } from "../../src/features/canvas/core/connectHit";

describe("linkCreate", () => {
  it("offers generators when dragging from image out port", () => {
    const img = createLegacyNode({ kind: "image", id: "i1" });
    const opts = linkCreateOptions({ originId: "i1", originKind: "out" }, [img]);
    expect(opts.some((o) => o.kind === "generator")).toBe(true);
  });

  it("offers inputs when dragging from generator in port", () => {
    const gen = createLegacyNode({ kind: "generator", id: "g1" });
    const opts = linkCreateOptions({ originId: "g1", originKind: "in" }, [gen]);
    expect(opts.some((o) => o.kind === "prompt")).toBe(true);
  });

  it("auto-creates output when dragging from generator out port", () => {
    const gen = createLegacyNode({ kind: "generator", id: "g1" });
    expect(shouldAutoCreateOutputOnDrag("g1", "out", [gen])).toBe(true);
    expect(shouldAutoCreateOutputOnDrag("g1", "in", [gen])).toBe(false);
  });

  it("createLinkedNodeAt wires origin out to new node", () => {
    const img = createLegacyNode({ kind: "image", id: "i1", x: 10, y: 10 });
    const nodes: LegacyNode[] = [img];
    const connections: LegacyConnection[] = [];
    const created = createLinkedNodeAt(
      "generator",
      "i1",
      "out",
      400,
      200,
      nodes,
      connections,
      (kind, x, y) => {
        const n = createLegacyNode({ kind, id: "g-new", x, y });
        nodes.push(n);
        return n;
      },
      (from, to) => {
        connections.push({ id: "c1", from, to });
      },
    );
    expect(created?.id).toBe("g-new");
    expect(connections).toEqual([{ id: "c1", from: "i1", to: "g-new" }]);
  });
});

describe("nodeInteraction", () => {
  it("treats studio-select and form fields as controls", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="studio-select"><button type="button" class="studio-select-trigger">Model</button></div>
      <textarea></textarea>
      <input type="text" />
      <div class="chrome">drag me</div>
    `;
    document.body.appendChild(root);
    const trigger = root.querySelector("button")!;
    const chrome = root.querySelector(".chrome")!;
    expect(isNodeControl(trigger)).toBe(true);
    expect(isNodeDragSurface(trigger)).toBe(false);
    expect(isNodeDragSurface(chrome)).toBe(true);
    root.remove();
  });

  it("excludes ports from drag surface", () => {
    const port = document.createElement("div");
    port.setAttribute("data-testid", "legacy-port-out-n1");
    expect(isNodeDragSurface(port)).toBe(false);
  });
});

describe("connectHit", () => {
  it("parses node id from port test id", () => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "legacy-port-in-abc-123");
    expect(nodeIdFromPortElement(el, "in")).toBe("abc-123");
  });
});
