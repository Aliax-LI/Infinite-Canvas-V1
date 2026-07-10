import { describe, expect, it } from "vitest";
import { buildGraphLayout } from "../../src/features/settings/workflows/workflowGraph";

describe("buildGraphLayout", () => {
  it("builds nodes and edges from comfy workflow", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: {} },
      "2": { class_type: "KSampler", inputs: { image: ["1", 0] } },
    };
    const layout = buildGraphLayout(workflow, [{ node: "1" }]);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(layout.nodes.find((n) => n.id === "1")?.exposedCount).toBe(1);
  });
});
