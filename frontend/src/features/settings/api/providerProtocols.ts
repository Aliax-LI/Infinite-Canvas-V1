import { FIXED_PROVIDER_IDS, isFixedProvider, type ProviderListItem } from "./providerListUi";

/** Matches backend `provider_probe_service.protocol_from_payload` whitelist + apimart. */
export const SUPPORTED_PROTOCOLS = [
  "openai",
  "apimart",
  "gemini",
  "volcengine",
  "runninghub",
  "jimeng",
  "codex",
  "gemini-cli",
] as const;

export type SupportedProtocol = (typeof SUPPORTED_PROTOCOLS)[number];

export const PROTOCOL_LABELS: Record<SupportedProtocol, string> = {
  openai: "OpenAI 直连",
  apimart: "异步协议",
  gemini: "Gemini 协议",
  volcengine: "火山引擎",
  runninghub: "RunningHub",
  jimeng: "即梦 CLI",
  codex: "Codex CLI",
  "gemini-cli": "Gemini CLI",
};

/** Protocols selectable when adding a custom platform (not built-in). */
export const CUSTOM_PLATFORM_PROTOCOLS: SupportedProtocol[] = ["openai", "apimart", "gemini"];

export const CLI_PROTOCOLS = new Set<string>(["jimeng", "codex", "gemini-cli"]);

export function isCliProvider(item: Pick<ProviderListItem, "protocol">) {
  return CLI_PROTOCOLS.has(String(item.protocol ?? "openai").toLowerCase());
}

export function effectiveProtocol(item: Pick<ProviderListItem, "id" | "protocol">): string {
  if (item.id === "runninghub") return "runninghub";
  if (item.id === "volcengine") return "volcengine";
  return String(item.protocol ?? "openai").toLowerCase();
}

export function showProtocolSelector(item: Pick<ProviderListItem, "id" | "protocol">) {
  return !isFixedProvider(item.id) && !isCliProvider(item);
}

/** Legacy: modelscope / volcengine standalone / CLI hide probe-async button. */
export function showProbeProtocolButton(item: Pick<ProviderListItem, "id" | "protocol">) {
  if (item.id === "modelscope" || item.id === "volcengine") return false;
  if (isCliProvider(item)) return false;
  return true;
}

export function protocolOptions(ids: readonly SupportedProtocol[] = SUPPORTED_PROTOCOLS) {
  return ids.map((id) => ({ value: id, label: PROTOCOL_LABELS[id] }));
}

export function formatProbeProtocolLabel(protocol: string) {
  const p = protocol.toLowerCase();
  if (p === "volcengine") return "方舟/Ark 任务协议";
  if (p === "apimart") return "APIMart 异步";
  if (p === "openai") return "OpenAI 兼容";
  if (p === "gemini") return "Gemini";
  return PROTOCOL_LABELS[p as SupportedProtocol] ?? p.toUpperCase();
}

export interface ProbeConnectionResult {
  ok?: boolean | null;
  message?: string;
  protocol?: string;
  status?: number;
  status_code?: number;
  model_count?: number;
  total?: number;
  image_models?: string[];
  chat_models?: string[];
  video_models?: string[];
  all?: string[];
  raw?: unknown;
}
