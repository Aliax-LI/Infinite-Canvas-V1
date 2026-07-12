import type { AiConfig } from "./types";

type Provider = NonNullable<AiConfig["api_providers"]>[number];

export function chatCapableProviders(config?: import("./types").AiConfig) {
  const list = (config?.api_providers ?? []).filter(
    (provider) => provider.enabled !== false && (provider.chat_models?.length ?? 0) > 0,
  );
  if ((config?.ms_chat_models?.length ?? 0) > 0 && !list.some((p) => p.id === "modelscope")) {
    list.push({
      id: "modelscope",
      name: "ModelScope",
      chat_models: config?.ms_chat_models ?? [],
      image_models: [],
      enabled: true,
    });
  }
  return list;
}

export function enabledProviders(config?: AiConfig): Provider[] {
  return (config?.api_providers ?? []).filter((provider) => provider.enabled !== false);
}

export function imageCapableProviders(config?: AiConfig): Provider[] {
  return enabledProviders(config).filter((provider) => (provider.image_models?.length ?? 0) > 0);
}

export function pickDefaultImageProvider(config: AiConfig | undefined, current = ""): string {
  const capable = imageCapableProviders(config);
  if (current && capable.some((provider) => provider.id === current)) {
    return current;
  }
  const primary = capable.find((provider) => provider.primary);
  return primary?.id ?? capable[0]?.id ?? current;
}

export function resolveChatModel(
  config: AiConfig | undefined,
  providerId: string,
  remembered: Record<string, string>,
  current = "",
): string {
  const provider = chatCapableProviders(config).find((item) => item.id === providerId);
  const models =
    providerId === "modelscope"
      ? config?.ms_chat_models ?? []
      : provider?.chat_models?.length
        ? provider.chat_models
        : config?.chat_models ?? [];
  const rememberedModel = remembered[providerId];
  if (current && models.includes(current)) return current;
  if (rememberedModel && models.includes(rememberedModel)) return rememberedModel;
  return models[0] ?? config?.chat_model ?? "";
}

export function resolveImageModel(
  config: AiConfig | undefined,
  imageProvider: string,
  current = "",
): string {
  const provider = imageCapableProviders(config).find((item) => item.id === imageProvider);
  const models = provider?.image_models?.length
    ? provider.image_models
    : config?.image_models ?? [];
  if (current && models.includes(current)) return current;
  return models[0] ?? config?.image_model ?? "";
}

export function videoCapableProviders(config?: AiConfig) {
  return enabledProviders(config).filter(
    (provider) =>
      provider.id !== "modelscope" &&
      ((provider as { video_models?: string[] }).video_models?.length ?? 0) > 0,
  );
}

export function resolveVideoModel(
  config: AiConfig | undefined,
  providerId: string,
  current = "",
): string {
  const provider = videoCapableProviders(config).find((item) => item.id === providerId);
  const models =
    (provider as { video_models?: string[] } | undefined)?.video_models ??
    (config as { video_models?: string[] } | undefined)?.video_models ??
    [];
  if (current && models.includes(current)) return current;
  return models[0] ?? "";
}

export function composerModelLabel(
  mode: import("./types").ChatMode,
  settings: import("./types").ChatSettings,
): string {
  const chatLabel = shortModelName(settings.chatModel);
  const imageLabel = shortModelName(settings.imageModel);
  if (mode === "image") return settings.imageModel || imageLabel;
  if (mode === "agent") return `Agent · ${chatLabel} + ${imageLabel}`;
  return settings.chatModel || chatLabel;
}

function shortModelName(value: string): string {
  return String(value || "").split("/").pop()?.split(":")[0] || "Model";
}
