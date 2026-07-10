import { describe, expect, it } from "vitest";
import {
  applyMiniCardPositions,
  buildMiniNodesFromFields,
  defaultMiniTestNodes,
  fieldsFromMiniCanvas,
} from "../../src/features/settings/workflows/workflowMiniCanvasUtils";

describe("workflowMiniCanvasUtils", () => {
  const zImageField = {
    id: "57_27_text",
    node: "57:27",
    input: "text",
    name: "text",
    type: "textarea",
    default:
      "Latina female with thick wavy hair, harbor boats and pastel houses behind. Breezy seaside light, warm tones, cinematic close-up. ",
  };

  it("builds prompt-only mini canvas for z-image workflow", () => {
    const nodes = buildMiniNodesFromFields([zImageField], { "57_27_text": zImageField.default });
    expect(nodes.some((n) => n.type === "prompt")).toBe(true);
    expect(nodes.some((n) => n.type === "image")).toBe(false);
    expect(nodes.find((n) => n.type === "prompt")?.text).toContain("Latina female");
  });

  it("merges prompt and media nodes into run fields", () => {
    const fields = [
      { id: "p1", node: "1", input: "text", name: "prompt", type: "textarea" },
      { id: "i1", node: "2", input: "image", name: "image", type: "image" },
      { id: "s1", node: "3", input: "seed", name: "seed", type: "number" },
    ];
    const nodes = [
      { id: "prompt_1", type: "prompt" as const, x: 0, y: 0, text: "hello" },
      { id: "image_1", type: "image" as const, x: 0, y: 0, value: "a.png" },
      { id: "comfy_1", type: "comfy" as const, x: 0, y: 0 },
      { id: "output_1", type: "output" as const, x: 0, y: 0 },
    ];
    const result = fieldsFromMiniCanvas({ s1: 42 }, fields, nodes);
    expect(result.p1).toBe("hello");
    expect(result.i1).toBe("a.png");
    expect(result.s1).toBe(42);
  });

  it("applies saved mini card positions", () => {
    const nodes = defaultMiniTestNodes();
    const shifted = applyMiniCardPositions(nodes, { comfy_1: { x: 400, y: 200 } });
    expect(shifted.find((n) => n.id === "comfy_1")?.x).toBe(400);
  });
});
