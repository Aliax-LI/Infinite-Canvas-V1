import { describe, expect, it } from "vitest";
import {
  buildPreviewValues,
  defaultPreviewValue,
  guessFieldType,
  parseOptionsText,
} from "../../src/features/settings/workflows/workflowFieldUtils";

describe("workflowFieldUtils", () => {
  it("guesses field types from value and input name", () => {
    expect(guessFieldType(true, "enabled")).toBe("boolean");
    expect(guessFieldType(0.8, "cfg")).toBe("slider");
    expect(guessFieldType(42, "seed")).toBe("number");
    expect(guessFieldType("a long prompt that should become textarea", "text")).toBe("textarea");
    expect(guessFieldType("file.png", "image")).toBe("image");
  });

  it("builds preview values preserving edits", () => {
    const fields = [
      { id: "a", node: "1", input: "text", name: "text", type: "textarea" },
      { id: "b", node: "1", input: "seed", name: "seed", type: "number" },
    ];
    const built = buildPreviewValues(fields, { a: "edited" });
    expect(built.a).toBe("edited");
    expect(built.b).toBe(defaultPreviewValue(fields[1]));
  });

  it("parses dropdown options text", () => {
    expect(parseOptionsText("a\nb, c")).toEqual(["a", "b", "c"]);
  });
});
