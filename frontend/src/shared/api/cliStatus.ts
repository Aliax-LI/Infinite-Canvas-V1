import { formatJimengCredit } from "./cliFormat";

/** Backend contracts for CLI status endpoints (matches history/main.py). */

export interface CodexCliApiResponse {
  installed: boolean;
  logged_in?: boolean | null;
  version?: string;
  path?: string;
  message?: string;
  image2_helper_installed?: boolean;
  image2_helper_path?: string;
}

export interface GeminiCliApiResponse {
  installed: boolean;
  logged_in?: boolean | null;
  version?: string;
  path?: string;
  message?: string;
  provider?: string;
}

export interface JimengCliApiResponse {
  installed: boolean;
  logged_in?: boolean;
  message?: string;
  path?: string;
  cli_version?: string;
  version_ok?: boolean | null;
  min_version?: string;
  raw?: unknown;
}

export interface CliStatusHelper {
  label: string;
  installed: boolean;
}

export interface CliStatusView {
  label: string;
  installed: boolean;
  ok: boolean | null;
  /** @deprecated 保留兼容；UI 请使用 version/path/message/helper */
  detail: string;
  version?: string;
  path?: string;
  message?: string;
  helper?: CliStatusHelper;
  image2HelperInstalled?: boolean;
  image2HelperPath?: string;
  versionWarning?: string;
  creditSummary?: string;
}

function buildDetail(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

/** 将 `codex-cli 0.134.0` 拆成二进制名与版本号 */
export function parseCliVersionDisplay(version?: string): { binary?: string; semver?: string } {
  if (!version) return {};
  const trimmed = version.trim();
  const match = trimmed.match(/^(.+?)\s+v?(\d[\w.\-+]*.*)$/i);
  if (match) {
    return { binary: match[1].trim(), semver: match[2].trim() };
  }
  return { semver: trimmed };
}

const CLI_BINARY_LABELS: Record<string, string> = {
  codex: "codex-cli",
  gemini: "gemini",
  jimeng: "dreamina",
};

export function cliBinaryLabel(panelId: string): string {
  return CLI_BINARY_LABELS[panelId] ?? "CLI";
}

export function normalizeCodexCliStatus(raw: CodexCliApiResponse): CliStatusView {
  const installed = Boolean(raw.installed);
  const helper = raw.installed
    ? {
        label: raw.image2_helper_installed ? "GPT Image 2 helper 已安装" : "未找到 GPT Image 2 helper",
        installed: Boolean(raw.image2_helper_installed),
      }
    : undefined;
  const helperNote = helper?.label;
  return {
    label: installed ? "已安装" : "未安装",
    installed,
    ok: installed,
    version: raw.version,
    path: raw.path,
    message: raw.message,
    helper,
    detail: buildDetail([raw.version, raw.path, helperNote, raw.message]),
    image2HelperInstalled: raw.image2_helper_installed,
    image2HelperPath: raw.image2_helper_path,
  };
}

export function normalizeGeminiCliStatus(raw: GeminiCliApiResponse): CliStatusView {
  const installed = Boolean(raw.installed);
  return {
    label: installed ? "已安装" : "未安装",
    installed,
    ok: installed,
    version: raw.version,
    path: raw.path,
    message: raw.message,
    detail: buildDetail([raw.version, raw.path, raw.message]),
  };
}

export function normalizeJimengCliStatus(raw: JimengCliApiResponse): CliStatusView {
  const installed = Boolean(raw.installed);
  const loggedIn = raw.logged_in === true;
  let versionWarning: string | undefined;
  if (installed && raw.version_ok === false) {
    versionWarning = `检测到 dreamina CLI 版本 ${raw.cli_version ?? "未知"}，低于推荐的 ${raw.min_version ?? "1.4.2"}。旧版本任务状态可能无法更新，请升级 CLI。`;
  }
  const creditSummary = loggedIn ? formatJimengCredit(raw.raw) : undefined;
  return {
    label: loggedIn ? "已登录" : installed ? "未登录" : "未安装",
    installed,
    ok: loggedIn ? true : installed ? false : false,
    version: raw.cli_version,
    path: raw.path,
    message: loggedIn ? undefined : raw.message,
    detail: buildDetail([raw.cli_version, raw.path, loggedIn ? undefined : raw.message]),
    versionWarning,
    creditSummary: creditSummary || undefined,
  };
}

export async function fetchCliStatus(
  panelId: string,
  statusPath: string,
  get: <T>(path: string) => Promise<T>,
): Promise<CliStatusView> {
  if (panelId === "codex") {
    return normalizeCodexCliStatus(await get<CodexCliApiResponse>(statusPath));
  }
  if (panelId === "gemini") {
    return normalizeGeminiCliStatus(await get<GeminiCliApiResponse>(statusPath));
  }
  if (panelId === "jimeng") {
    return normalizeJimengCliStatus(await get<JimengCliApiResponse>(statusPath));
  }
  throw new Error(`Unknown CLI panel: ${panelId}`);
}
