import { describe, expect, it } from "vitest";
import {
  canvasListReducer,
  filterCanvasesByProject,
  rememberedProjectId,
} from "../../src/features/canvas-list/state";
import type { CanvasRecord } from "../../src/types/api";

const sample: CanvasRecord[] = [
  { id: "1", title: "A", icon: "🧩", kind: "smart", project: "default" },
  { id: "2", title: "B", icon: "🧩", kind: "smart", project: "p2" },
  { id: "3", title: "C", icon: "🧩", kind: "classic", project: "default", deleted_at: 1 },
];

describe("canvas-list state", () => {
  it("filters canvases by project", () => {
    const result = filterCanvasesByProject(sample, "default");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("defaults missing project to default", () => {
    const canvases = [{ id: "x", title: "X", icon: "🧩", kind: "smart" }];
    expect(filterCanvasesByProject(canvases, "default")).toHaveLength(1);
  });

  it("set_project updates current project", () => {
    const state = canvasListReducer(
      { currentProjectId: "default", canvases: [], deletedCanvases: [] },
      { type: "set_project", projectId: "p2" },
    );
    expect(state.currentProjectId).toBe("p2");
  });

  it("add_canvas appends canvas", () => {
    const canvas = sample[0];
    const state = canvasListReducer(
      { currentProjectId: "default", canvases: [], deletedCanvases: [] },
      { type: "add_canvas", canvas },
    );
    expect(state.canvases).toHaveLength(1);
  });

  it("remove_canvas removes by id", () => {
    const state = canvasListReducer(
      { currentProjectId: "default", canvases: sample, deletedCanvases: [] },
      { type: "remove_canvas", id: "1" },
    );
    expect(state.canvases.find((c) => c.id === "1")).toBeUndefined();
  });

  it("restore_canvas moves from deleted to active", () => {
    const state = canvasListReducer(
      {
        currentProjectId: "default",
        canvases: [],
        deletedCanvases: [sample[0]],
      },
      { type: "restore_canvas", canvas: sample[0] },
    );
    expect(state.canvases).toHaveLength(1);
    expect(state.deletedCanvases).toHaveLength(0);
  });

  it("rememberedProjectId returns string", () => {
    expect(typeof rememberedProjectId()).toBe("string");
  });
});
