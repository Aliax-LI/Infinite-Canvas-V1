import { describe, expect, it } from "vitest";
import {
  connectionPath,
  getGroupMembers,
  smartGroupLayout,
} from "../../src/features/smart-canvas/core/layout";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

const group: SmartNode = {
  id: "g1",
  kind: "group",
  x: 100,
  y: 100,
  width: 400,
  height: 300,
  title: "Group",
  prompt: "",
  images: [],
  settings: {},
  member_ids: ["n1", "n2"],
};

const members: SmartNode[] = [
  { id: "n1", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "A", prompt: "", images: [], settings: {}, group_id: "g1" },
  { id: "n2", kind: "image", x: 0, y: 0, width: 280, height: 200, title: "B", prompt: "", images: [], settings: {}, group_id: "g1" },
];

describe("graph layout", () => {
  it("getGroupMembers finds by member_ids and group_id", () => {
    const all = [group, ...members];
    expect(getGroupMembers(group, all)).toHaveLength(2);
  });

  it("smartGroupLayout sizes group from members", () => {
    const result = smartGroupLayout(group, members);
    expect(result.group.width).toBeGreaterThan(280);
    expect(result.members[0].x).toBeGreaterThan(group.x);
  });

  it("connectionPath connects node centers", () => {
    const a = { ...members[0], x: 0, y: 0 };
    const b = { ...members[1], x: 400, y: 100 };
    const path = connectionPath(a, b);
    expect(path.x2 - path.x1).toBeGreaterThan(0);
  });
});
