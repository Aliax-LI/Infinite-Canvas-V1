import { describe, expect, it } from "vitest";
import {
  chatCapableProviders,
  imageCapableProviders,
  pickDefaultImageProvider,
  resolveImageModel,
} from "../../src/features/chat/providers";
import type { AiConfig } from "../../src/features/chat/types";

const config: AiConfig = {
  image_model: "dall-e",
  api_providers: [
    {
      id: "modelscope",
      name: "ModelScope",
      chat_models: ["MiniMax/MiniMax-M2.7"],
      image_models: [],
      enabled: true,
    },
    {
      id: "openai",
      name: "OpenAI",
      chat_models: ["gpt-5"],
      image_models: ["dall-e"],
      enabled: true,
      primary: true,
    },
  ],
};

describe("chat providers", () => {
  it("filters image-capable providers", () => {
    expect(imageCapableProviders(config).map((p) => p.id)).toEqual(["openai"]);
  });

  it("injects modelscope into chat providers when ms models exist", () => {
    expect(chatCapableProviders(config).map((p) => p.id).sort()).toEqual(["modelscope", "openai"]);
  });

  it("falls back from modelscope to image-capable provider", () => {
    expect(pickDefaultImageProvider(config, "modelscope")).toBe("openai");
  });

  it("resolves image model for selected provider", () => {
    expect(resolveImageModel(config, "openai", "")).toBe("dall-e");
  });
});
