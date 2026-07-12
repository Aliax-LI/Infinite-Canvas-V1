import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANGLE_CLOUD_MODEL_STORAGE_KEY,
  ANGLE_ENGINE_STORAGE_KEY,
  DEFAULT_ANGLE_CLOUD_MODEL,
  isAngleCloudModel,
  resolveAngleCloudModel,
  resolveAngleCloudModels,
  resolveAngleEngine,
} from "../../src/features/tools/shared/angleOptions";
import type { AiConfig } from "../../src/features/chat/types";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("angleOptions", () => {
  it("detects Qwen image-edit models for angle cloud", () => {
    expect(isAngleCloudModel("Qwen/Qwen-Image-Edit-2511")).toBe(true);
    expect(isAngleCloudModel("Qwen/Qwen-Image-Edit-2509")).toBe(true);
    expect(isAngleCloudModel("Tongyi-MAI/Z-Image-Turbo")).toBe(false);
  });

  it("filters cloud models from ModelScope provider config", () => {
    const config: AiConfig = {
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: [
            "Qwen/Qwen-Image-Edit-2511",
            "Tongyi-MAI/Z-Image-Turbo",
            "Qwen/Qwen-Image-Edit-2509",
          ],
        },
      ],
    };
    expect(resolveAngleCloudModels(config)).toEqual([
      "Qwen/Qwen-Image-Edit-2511",
      "Qwen/Qwen-Image-Edit-2509",
    ]);
  });

  it("falls back to default edit models when config empty", () => {
    expect(resolveAngleCloudModels(undefined)).toContain(DEFAULT_ANGLE_CLOUD_MODEL);
  });

  it("prefers remembered cloud model when still available", () => {
    const config: AiConfig = {
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: ["Qwen/Qwen-Image-Edit-2511", "Qwen/Qwen-Image-Edit-2509"],
        },
      ],
    };
    expect(resolveAngleCloudModel(config, "Qwen/Qwen-Image-Edit-2509")).toBe(
      "Qwen/Qwen-Image-Edit-2509",
    );
  });

  it("reads engine and model from localStorage", () => {
    localStorage.setItem(ANGLE_ENGINE_STORAGE_KEY, "cloud");
    localStorage.setItem(ANGLE_CLOUD_MODEL_STORAGE_KEY, "Qwen/Qwen-Image-Edit-2509");
    expect(resolveAngleEngine()).toBe("cloud");

    const config: AiConfig = {
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: ["Qwen/Qwen-Image-Edit-2511", "Qwen/Qwen-Image-Edit-2509"],
        },
      ],
    };
    expect(resolveAngleCloudModel(config)).toBe("Qwen/Qwen-Image-Edit-2509");
  });
});
