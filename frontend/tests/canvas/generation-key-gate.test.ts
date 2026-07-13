import { describe, expect, it } from "vitest";
import { resolveGenerationKeyGate } from "../../src/features/canvas/core/generationKeyGate";
import type { AiConfig } from "../../src/features/chat/types";

const configWithKeys: AiConfig = {
  has_ms_key: true,
  comfy_instances: ["127.0.0.1:8188"],
  api_providers: [
    {
      id: "comfly",
      name: "Comfly",
      enabled: true,
      has_key: true,
      image_models: ["flux"],
      chat_models: ["gpt-4o"],
      video_models: ["veo3"],
    },
    {
      id: "modelscope",
      name: "ModelScope",
      enabled: true,
      has_key: true,
      image_models: [],
      chat_models: [],
      ms_loras: [],
    },
    {
      id: "runninghub",
      name: "RunningHub",
      enabled: true,
      has_key: true,
      has_wallet_key: false,
      image_models: [],
      chat_models: [],
    },
  ],
};

const configMissingKeys: AiConfig = {
  has_ms_key: false,
  comfy_instances: [],
  api_providers: [
    {
      id: "comfly",
      name: "Comfly",
      enabled: true,
      has_key: false,
      image_models: ["flux"],
      chat_models: ["gpt-4o"],
      video_models: ["veo3"],
    },
    {
      id: "modelscope",
      name: "ModelScope",
      enabled: true,
      has_key: false,
      image_models: [],
      chat_models: [],
    },
    {
      id: "runninghub",
      name: "RunningHub",
      enabled: true,
      has_key: false,
      has_wallet_key: false,
      image_models: [],
      chat_models: [],
    },
  ],
};

describe("resolveGenerationKeyGate", () => {
  it("marks msgen ready when has_ms_key", () => {
    expect(resolveGenerationKeyGate("msgen", {}, configWithKeys).ready).toBe(
      true,
    );
  });

  it("blocks msgen when ModelScope key missing", () => {
    const gate = resolveGenerationKeyGate("msgen", {}, configMissingKeys);
    expect(gate.ready).toBe(false);
    expect(gate.messageKey).toBe("missingModelscopeKeyGuide");
    expect(gate.settingsPath).toBe("/settings/api");
  });

  it("blocks generator when selected provider lacks key", () => {
    const gate = resolveGenerationKeyGate(
      "generator",
      { apiProvider: "comfly" },
      configMissingKeys,
    );
    expect(gate.ready).toBe(false);
    expect(gate.providerId).toBe("comfly");
  });

  it("allows generator when provider has_key", () => {
    expect(
      resolveGenerationKeyGate(
        "generator",
        { apiProvider: "comfly" },
        configWithKeys,
      ).ready,
    ).toBe(true);
  });

  it("blocks llm modelscope without ms key", () => {
    const gate = resolveGenerationKeyGate(
      "llm",
      { llmProvider: "modelscope" },
      configMissingKeys,
    );
    expect(gate.ready).toBe(false);
    expect(gate.messageKey).toBe("missingModelscopeKeyGuide");
  });

  it("blocks rh without coin or wallet key", () => {
    const gate = resolveGenerationKeyGate("rh", {}, configMissingKeys);
    expect(gate.ready).toBe(false);
    expect(gate.messageKey).toBe("missingRunningHubKeyGuide");
  });

  it("blocks comfy without instances", () => {
    const gate = resolveGenerationKeyGate("comfy", {}, configMissingKeys);
    expect(gate.ready).toBe(false);
    expect(gate.settingsPath).toBe("/settings/workflows");
  });

  it("allows CLI protocol providers without has_key", () => {
    const config: AiConfig = {
      api_providers: [
        {
          id: "jimeng",
          name: "Jimeng",
          protocol: "jimeng",
          enabled: true,
          has_key: false,
          image_models: ["jimeng"],
        },
      ],
    };
    expect(
      resolveGenerationKeyGate(
        "generator",
        { apiProvider: "jimeng" },
        config,
      ).ready,
    ).toBe(true);
  });
});
