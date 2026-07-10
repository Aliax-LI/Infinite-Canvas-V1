import { describe, expect, it } from "vitest";
import {
  buildLoraIdOptions,
  buildLoraTargetOptions,
  createEmptyLora,
  normalizeLoraStrength,
  normalizeMsLoras,
} from "../../src/features/settings/api/msLoraState";

describe("msLoraState", () => {
  it("builds target options from saved image models only", () => {
    const options = buildLoraTargetOptions(["custom/model-a", "custom/model-b"], "custom/model-a");
    expect(options).toEqual(["custom/model-a", "custom/model-b"]);
    expect(options).not.toContain("Tongyi-MAI/Z-Image-Turbo");
  });

  it("builds lora id options from configured loras and catalog", () => {
    const options = buildLoraIdOptions(
      [
        { id: "Daniel8152/film", target_model: "custom/model", strength: 0.8 },
        { id: "user/custom-lora", target_model: "custom/model", strength: 0.8 },
      ],
      "Daniel8152/film",
      [{ value: "catalog/lora-a", label: "LoRA A" }],
    );
    expect(options.map((o) => o.value)).toEqual([
      "Daniel8152/film",
      "catalog/lora-a",
      "user/custom-lora",
    ]);
  });

  it("normalizes strength within 0..2", () => {
    expect(normalizeLoraStrength(3)).toBe(2);
    expect(normalizeLoraStrength(-1)).toBe(0);
    expect(normalizeLoraStrength("bad")).toBe(0.8);
  });

  it("filters incomplete loras on normalize", () => {
    const out = normalizeMsLoras([
      { id: "Daniel8152/film", target_model: "Tongyi-MAI/Z-Image-Turbo", strength: 0.8 },
      { id: "", target_model: "x", strength: 0.5 },
      { id: "dup", target_model: "m1", strength: 0.5 },
      { id: "dup", target_model: "m1", strength: 0.6 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("Daniel8152/film");
  });

  it("creates empty lora with first image model target", () => {
    const lora = createEmptyLora(["my/image-model"]);
    expect(lora.target_model).toBe("my/image-model");
    expect(lora.strength).toBe(0.8);
  });

  it("creates empty lora without preset fallback when image models missing", () => {
    const lora = createEmptyLora([]);
    expect(lora.target_model).toBe("");
  });
});
