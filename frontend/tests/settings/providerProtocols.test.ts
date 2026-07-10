import { describe, expect, it } from "vitest";
import {
  CUSTOM_PLATFORM_PROTOCOLS,
  effectiveProtocol,
  showProbeProtocolButton,
  showProtocolSelector,
  SUPPORTED_PROTOCOLS,
} from "../../src/features/settings/api/providerProtocols";

describe("providerProtocols", () => {
  it("matches backend supported protocol list", () => {
    expect(SUPPORTED_PROTOCOLS).toEqual([
      "openai",
      "apimart",
      "gemini",
      "volcengine",
      "runninghub",
      "jimeng",
      "codex",
      "gemini-cli",
    ]);
    expect(CUSTOM_PLATFORM_PROTOCOLS).toEqual(["openai", "apimart", "gemini"]);
  });

  it("resolves effective protocol for fixed providers", () => {
    expect(effectiveProtocol({ id: "runninghub", protocol: "openai" })).toBe("runninghub");
    expect(effectiveProtocol({ id: "volcengine", protocol: "openai" })).toBe("volcengine");
    expect(effectiveProtocol({ id: "custom", protocol: "apimart" })).toBe("apimart");
  });

  it("controls protocol selector visibility", () => {
    expect(showProtocolSelector({ id: "modelscope", protocol: "openai" })).toBe(false);
    expect(showProtocolSelector({ id: "custom", protocol: "codex" })).toBe(false);
    expect(showProtocolSelector({ id: "custom", protocol: "openai" })).toBe(true);
  });

  it("controls probe button visibility", () => {
    expect(showProbeProtocolButton({ id: "modelscope", protocol: "openai" })).toBe(false);
    expect(showProbeProtocolButton({ id: "volcengine", protocol: "volcengine" })).toBe(false);
    expect(showProbeProtocolButton({ id: "custom", protocol: "codex" })).toBe(false);
    expect(showProbeProtocolButton({ id: "runninghub", protocol: "runninghub" })).toBe(true);
    expect(showProbeProtocolButton({ id: "custom", protocol: "openai" })).toBe(true);
  });
});
