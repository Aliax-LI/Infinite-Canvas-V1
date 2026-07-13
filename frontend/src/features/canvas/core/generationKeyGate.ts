/**
 * Classic generation-node API key readiness.
 * Reuses `/api/config` public providers (`has_key` / `has_ms_key`) — no parallel config.
 */

import type { AiConfig } from "../../chat/types";
import type { LegacyNode } from "./types";

const CLI_PROTOCOLS = new Set(["jimeng", "codex", "gemini-cli"]);

export type GenerationKeyGateKind =
  | "generator"
  | "msgen"
  | "video"
  | "llm"
  | "rh"
  | "comfy"
  | "ltxDirector";

export interface GenerationKeyGate {
  /** When false, node controls should gray out and run must be blocked. */
  ready: boolean;
  /** i18n key under `canvas` namespace. */
  messageKey: string;
  /** Fallback message (zh) when i18n missing. */
  messageFallback: string;
  /** Deep-link into settings. */
  settingsPath: string;
  /** Provider id for tests / analytics. */
  providerId?: string;
}

type PublicProvider = NonNullable<AiConfig["api_providers"]>[number] & {
  has_key?: boolean;
  has_wallet_key?: boolean;
  protocol?: string;
};

function findProvider(
  config: AiConfig | undefined,
  id: string,
): PublicProvider | undefined {
  return (config?.api_providers as PublicProvider[] | undefined)?.find(
    (p) => p.id === id,
  );
}

function providerHasUsableKey(provider: PublicProvider | undefined): boolean {
  if (!provider) return false;
  const protocol = String(provider.protocol ?? "openai").toLowerCase();
  if (CLI_PROTOCOLS.has(protocol)) return true;
  return Boolean(provider.has_key);
}

function modelscopeReady(config: AiConfig | undefined): boolean {
  if (config?.has_ms_key) return true;
  return providerHasUsableKey(findProvider(config, "modelscope"));
}

function missingKeyGate(
  providerId: string,
  label: string,
  settingsPath = "/settings/api",
): GenerationKeyGate {
  return {
    ready: false,
    messageKey: "missingApiKeyGuide",
    messageFallback: `未配置 ${label} API Key，请到 设置 → API 配置后使用。`,
    settingsPath,
    providerId,
  };
}

function readyGate(providerId?: string): GenerationKeyGate {
  return {
    ready: true,
    messageKey: "",
    messageFallback: "",
    settingsPath: "/settings/api",
    providerId,
  };
}

/** Resolve whether a classic gen node can run given current `/api/config`. */
export function resolveGenerationKeyGate(
  kind: string,
  settings: Record<string, unknown> | undefined,
  config: AiConfig | undefined,
): GenerationKeyGate {
  // No config yet → do not block (UI waits until `/api/config` resolves).
  if (!config) return readyGate();

  const s = settings ?? {};

  if (kind === "msgen") {
    if (modelscopeReady(config)) return readyGate("modelscope");
    return {
      ready: false,
      messageKey: "missingModelscopeKeyGuide",
      messageFallback:
        "未配置 ModelScope API Key，请到 设置 → API → Modelscope 配置后使用。",
      settingsPath: "/settings/api",
      providerId: "modelscope",
    };
  }

  if (kind === "generator") {
    const providerId = String(s.apiProvider ?? s.provider_id ?? "").trim();
    if (!providerId) {
      return {
        ready: false,
        messageKey: "noApiProvidersHint",
        messageFallback: "暂无 API 平台，请到 API 设置添加",
        settingsPath: "/settings/api",
      };
    }
    const provider = findProvider(config, providerId);
    if (providerHasUsableKey(provider)) return readyGate(providerId);
    const name = provider?.name || providerId;
    return missingKeyGate(providerId, name);
  }

  if (kind === "video") {
    const providerId = String(s.apiProvider ?? s.provider_id ?? "").trim();
    if (!providerId) {
      return {
        ready: false,
        messageKey: "noVideoProviders",
        messageFallback: "暂无视频 API 平台，请到 API 设置添加",
        settingsPath: "/settings/api",
      };
    }
    const provider = findProvider(config, providerId);
    if (providerHasUsableKey(provider)) return readyGate(providerId);
    return missingKeyGate(providerId, provider?.name || providerId);
  }

  if (kind === "llm") {
    const providerId = String(s.llmProvider ?? "").trim();
    if (!providerId) {
      return {
        ready: false,
        messageKey: "noApiProvidersHint",
        messageFallback: "暂无 API 平台，请到 API 设置添加",
        settingsPath: "/settings/api",
      };
    }
    if (providerId === "modelscope") {
      if (modelscopeReady(config)) return readyGate("modelscope");
      return {
        ready: false,
        messageKey: "missingModelscopeKeyGuide",
        messageFallback:
          "未配置 ModelScope API Key，请到 设置 → API → Modelscope 配置后使用。",
        settingsPath: "/settings/api",
        providerId: "modelscope",
      };
    }
    const provider = findProvider(config, providerId);
    if (providerHasUsableKey(provider)) return readyGate(providerId);
    return missingKeyGate(providerId, provider?.name || providerId);
  }

  if (kind === "rh") {
    const provider = findProvider(config, "runninghub");
    if (provider?.has_key || provider?.has_wallet_key) {
      return readyGate("runninghub");
    }
    return {
      ready: false,
      messageKey: "missingRunningHubKeyGuide",
      messageFallback:
        "未配置 RunningHub API Key，请到 设置 → API → RunningHub 配置后使用。",
      settingsPath: "/settings/api",
      providerId: "runninghub",
    };
  }

  if (kind === "comfy" || kind === "ltxDirector") {
    const instances = config.comfy_instances;
    const hasInstance =
      Array.isArray(instances) &&
      instances.some((item) => String(item ?? "").trim());
    if (hasInstance) return readyGate("comfy");
    return {
      ready: false,
      messageKey: "missingComfyGuide",
      messageFallback:
        "未配置 ComfyUI 实例，请到 设置 → 工作流 / ComfyUI 添加地址后使用。",
      settingsPath: "/settings/workflows",
      providerId: "comfy",
    };
  }

  return readyGate();
}

export function generationKeyGateForNode(
  node: Pick<LegacyNode, "kind" | "settings">,
  config: AiConfig | undefined,
): GenerationKeyGate {
  return resolveGenerationKeyGate(node.kind, node.settings, config);
}
