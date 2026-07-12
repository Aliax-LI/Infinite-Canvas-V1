import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KLEIN_CLOUD_MODEL,
  KLEIN_CLOUD_MODEL_STORAGE_KEY,
  KLEIN_ENGINE_STORAGE_KEY,
  alignKleinMsSize,
  buildKleinLocalParams,
  isKleinCloudModel,
  resolveKleinCloudModel,
  resolveKleinCloudModels,
  resolveKleinEngine,
} from "../../src/features/tools/shared/kleinOptions";
import type { AiConfig } from "../../src/features/chat/types";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("kleinOptions", () => {
  it("detects Klein / FLUX.2 cloud models", () => {
    expect(isKleinCloudModel("black-forest-labs/FLUX.2-klein-9B")).toBe(true);
    expect(isKleinCloudModel("black-forest-labs/FLUX.2-dev")).toBe(true);
    expect(isKleinCloudModel("Tongyi-MAI/Z-Image-Turbo")).toBe(false);
  });

  it("filters cloud models from ModelScope provider config", () => {
    const config: AiConfig = {
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: [
            "black-forest-labs/FLUX.2-klein-9B",
            "Tongyi-MAI/Z-Image-Turbo",
            "black-forest-labs/FLUX.2-klein-4B",
          ],
        },
      ],
    };
    expect(resolveKleinCloudModels(config)).toEqual([
      "black-forest-labs/FLUX.2-klein-9B",
      "black-forest-labs/FLUX.2-klein-4B",
    ]);
  });

  it("falls back to default Klein models when config empty", () => {
    expect(resolveKleinCloudModels(undefined)).toContain(DEFAULT_KLEIN_CLOUD_MODEL);
  });

  it("prefers remembered cloud model when still available", () => {
    const config: AiConfig = {
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: [
            "black-forest-labs/FLUX.2-klein-9B",
            "black-forest-labs/FLUX.2-klein-4B",
          ],
        },
      ],
    };
    expect(resolveKleinCloudModel(config, "black-forest-labs/FLUX.2-klein-4B")).toBe(
      "black-forest-labs/FLUX.2-klein-4B",
    );
  });

  it("reads engine and model from localStorage", () => {
    localStorage.setItem(KLEIN_ENGINE_STORAGE_KEY, "cloud");
    localStorage.setItem(KLEIN_CLOUD_MODEL_STORAGE_KEY, "black-forest-labs/FLUX.2-klein-4B");
    expect(resolveKleinEngine()).toBe("cloud");

    const config: AiConfig = {
      api_providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          image_models: [
            "black-forest-labs/FLUX.2-klein-9B",
            "black-forest-labs/FLUX.2-klein-4B",
          ],
        },
      ],
    };
    expect(resolveKleinCloudModel(config)).toBe("black-forest-labs/FLUX.2-klein-4B");
  });

  it("aligns ModelScope sizes like legacy computeMsSize", () => {
    expect(alignKleinMsSize(0, 0)).toEqual({ width: 1024, height: 1024 });
    expect(alignKleinMsSize(1000, 1000)).toEqual({ width: 1024, height: 1024 });
    expect(alignKleinMsSize(3000, 1500).width).toBeLessThanOrEqual(2048);
  });

  it("builds local params matching legacy klein.html (no size override)", () => {
    const params = buildKleinLocalParams({
      prompt: "night",
      mainImage: "main.png",
      auxA: "a.png",
    });
    expect(params["168"]).toEqual({ text: "night" });
    expect(params["278"]).toEqual({ image: "main.png" });
    expect(params["270"]).toEqual({ image: "a.png" });
    expect(params["292"]).toEqual({ image: "" });
    expect(params["313"]).toEqual({ value: true });
    expect(params["314"]).toEqual({ value: false });
    expect(typeof params["158"]?.noise_seed).toBe("number");
    expect(params["156"]).toBeUndefined();
    expect(params["152"]).toBeUndefined();
  });
});
