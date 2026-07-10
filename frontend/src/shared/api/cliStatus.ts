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

export interface CliStatusView {
  label: string;
  installed: boolean;
  ok: boolean | null;
  detail: string;
  image2HelperInstalled?: boolean;
  image2HelperPath?: string;
  versionWarning?: string;
  creditSummary?: string;
}

function buildDetail(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

export function normalizeCodexCliStatus(raw: CodexCliApiResponse): CliStatusView {
  const installed = Boolean(raw.installed);
  const helperNote = raw.image2_helper_installed
    ? "GPT Image 2 helper 已安装"
    : raw.installed
      ? "未找到 GPT Image 2 helper"
      : undefined;
  return {
    label: installed ? "已安装" : "未安装",
    installed,
    ok: installed,
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
