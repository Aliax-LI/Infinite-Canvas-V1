import { describe, expect, it } from "vitest";
import {
  applyModelPickerState,
  buildModelPickerState,
  hasFetchedModels,
  normalizeFetchedModels,
} from "../../src/features/settings/api/modelPickerState";

describe("modelPickerState", () => {
  it("normalizes fetched models when all is missing", () => {
    const normalized = normalizeFetchedModels({
      image_models: ["flux"],
      chat_models: ["qwen"],
      video_models: ["sora"],
    });
    expect(normalized.all).toEqual(["flux", "qwen", "sora"]);
    expect(hasFetchedModels(normalized)).toBe(true);
  });

  it("reports empty fetched models", () => {
    expect(hasFetchedModels(null)).toBe(false);
    expect(hasFetchedModels({ all: [] })).toBe(false);
  });

  it("prefers existing category and checks only configured models", () => {
    const state = buildModelPickerState(
      {
        all: ["gpt-image", "gpt-4o", "sora-2"],
        image_models: ["gpt-image"],
        chat_models: ["gpt-4o"],
        video_models: ["sora-2"],
      },
      {
        image_models: ["gpt-image"],
        chat_models: [],
        video_models: [],
      },
    );

    expect(state.category["gpt-image"]).toBe("image");
    expect(state.selected["gpt-image"]).toBe(true);
    expect(state.selected["gpt-4o"]).toBe(false);
    expect(state.selected["sora-2"]).toBe(false);
  });

  it("replaces provider models from selected picker state", () => {
    const state = buildModelPickerState(
      {
        all: ["gpt-image", "gpt-4o", "sora-2"],
        image_models: ["gpt-image"],
        chat_models: ["gpt-4o"],
        video_models: ["sora-2"],
      },
      { image_models: ["gpt-image"], chat_models: [], video_models: [] },
    );
    state.selected["gpt-4o"] = true;
    state.selected["sora-2"] = true;

    expect(applyModelPickerState(state)).toEqual({
      image_models: ["gpt-image"],
      chat_models: ["gpt-4o"],
      video_models: ["sora-2"],
    });
  });
});
