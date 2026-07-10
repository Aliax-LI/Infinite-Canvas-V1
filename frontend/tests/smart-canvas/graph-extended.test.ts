import { describe, expect, it } from "vitest";
import {
  getGroupMembers,
  smartGroupLayout,
  connectionPath,
} from "../../src/features/smart-canvas/core/layout";
import type { SmartNode } from "../../src/features/smart-canvas/core/types";

const node = (id: string, x = 0, y = 0): SmartNode => ({
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

describe("graph extended", () => {
  it("connectionPath vertical alignment", () => {
    const a = node("a", 0, 0);
    const b = node("b", 0, 400);
    const path = connectionPath(a, b);
    expect(path.x1).toBe(path.x2);
    expect(path.y2).toBeGreaterThan(path.y1);
  });

  it("smartGroupLayout single member", () => {
    const group = { ...node("g", 10, 10), kind: "group", member_ids: ["m1"] };
    const result = smartGroupLayout(group, [node("m1")]);
    expect(result.members[0].x).toBeGreaterThan(group.x);
  });

  it("getGroupMembers empty when no links", () => {
    const group = { ...node("g"), kind: "group", member_ids: [] };
    expect(getGroupMembers(group, [group, node("x")])).toHaveLength(0);
  });

  it("connectionPath horizontal alignment", () => {
    const a = node("a", 0, 100);
    const b = node("b", 500, 100);
    const path = connectionPath(a, b);
    expect(path.y1).toBe(path.y2);
  });
});
