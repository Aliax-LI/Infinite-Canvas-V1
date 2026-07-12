import { describe, expect, it } from "vitest";
import {
  annotationCapableProviders,
  filterAnnotationChatModels,
  looksLikeVisionChatModel,
} from "../../src/features/asset-manager/annotationModelFilter";

describe("annotationModelFilter", () => {
  it("detects common vision model name patterns", () => {
    expect(looksLikeVisionChatModel("gpt-4o")).toBe(true);
    expect(looksLikeVisionChatModel("Qwen/Qwen2.5-VL-7B-Instruct")).toBe(true);
    expect(looksLikeVisionChatModel("gemini-2.5-flash")).toBe(true);
    expect(looksLikeVisionChatModel("gpt-3.5-turbo")).toBe(false);
  });

  it("filters chat models to vision-capable ones with fallback", () => {
    expect(
      filterAnnotationChatModels(["gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini"]),
    ).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(filterAnnotationChatModels(["gpt-3.5-turbo", "llama-3"])).toEqual([
      "gpt-3.5-turbo",
      "llama-3",
    ]);
  });

  it("keeps only providers with annotation-capable models", () => {
    const providers = annotationCapableProviders([
      {
        id: "openai",
        name: "OpenAI",
        enabled: true,
        chat_models: ["gpt-3.5-turbo", "gpt-4o"],
      },
      {
        id: "text-only",
        name: "Text",
        enabled: true,
        chat_models: ["llama-3"],
      },
      {
        id: "disabled",
        name: "Off",
        enabled: false,
        chat_models: ["gpt-4o"],
      },
    ]);

    expect(providers.map((p) => p.id)).toEqual(["openai", "text-only"]);
    expect(providers[0]?.chat_models).toEqual(["gpt-4o"]);
    expect(providers[1]?.chat_models).toEqual(["llama-3"]);
  });
});
