import { describe, expect, it } from "vitest";
import {
  autoArrangeNodes,
  computeNodeBounds,
  getGroupMembers,
  smartGroupLayout,
  connectionPath,
} from "../../src/features/smart-canvas/core/layout";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

const baseNode = (id: string, x: number, y: number): SmartNode => ({
  id,
  kind: "image",
  x,
  y,
  width: 280,
  height: 200,
  title: id,
  prompt: "",
  images: [],
  settings: {},
});

describe("layout group", () => {
  it("smartGroupLayout arranges 4 members in 2x2 grid", () => {
    const group = baseNode("g1", 50, 50);
    group.kind = "group";
    group.member_ids = ["a", "b", "c", "d"];
    const members = ["a", "b", "c", "d"].map((id) => ({
      ...baseNode(id, 0, 0),
      group_id: "g1",
    }));
    const result = smartGroupLayout(group, members);
    expect(result.members).toHaveLength(4);
    expect(result.group.width).toBeGreaterThan(560);
    expect(result.members[3].y).toBeGreaterThan(result.members[0].y);
  });

  it("getGroupMembers includes nodes linked by group_id", () => {
    const group = { ...baseNode("g1", 0, 0), kind: "group", member_ids: ["n1"] };
    const n2 = { ...baseNode("n2", 0, 0), group_id: "g1" };
    const members = getGroupMembers(group, [group, baseNode("n1", 0, 0), n2]);
    expect(members.map((m) => m.id).sort()).toEqual(["n1", "n2"]);
  });

  it("autoArrangeNodes with 5 nodes fills second row", () => {
    const nodes = [1, 2, 3, 4, 5].map((i) => baseNode(String(i), 0, 0));
    const arranged = autoArrangeNodes(nodes, 3);
    expect(arranged[3].y).toBeGreaterThan(0);
    expect(arranged[4].y).toBe(arranged[3].y);
  });

  it("computeNodeBounds for grouped layout", () => {
    const nodes = [baseNode("1", 0, 0), baseNode("2", 400, 300)];
    const b = computeNodeBounds(nodes)!;
    expect(b.maxX).toBe(680);
  });

  it("connectionPath between arranged group members", () => {
    const a = baseNode("a", 100, 100);
    const b = baseNode("b", 500, 200);
    const path = connectionPath(a, b);
    expect(path.x2).toBeGreaterThan(path.x1);
    expect(path.y2).toBe(300);
  });
});
