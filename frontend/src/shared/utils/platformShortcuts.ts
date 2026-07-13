/** Platform-aware primary modifier (⌘ on Apple, Ctrl elsewhere) for canvas shortcuts. */

export type PlatformShortcutEnv = {
  platform?: string;
  userAgent?: string;
  /** From `navigator.userAgentData.platform` when available. */
  userAgentDataPlatform?: string;
};

function readEnv(env?: PlatformShortcutEnv): Required<PlatformShortcutEnv> {
  if (env) {
    return {
      platform: env.platform ?? "",
      userAgent: env.userAgent ?? "",
      userAgentDataPlatform: env.userAgentDataPlatform ?? "",
    };
  }
  if (typeof navigator === "undefined") {
    return { platform: "", userAgent: "", userAgentDataPlatform: "" };
  }
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return {
    platform: nav.platform ?? "",
    userAgent: nav.userAgent ?? "",
    userAgentDataPlatform: nav.userAgentData?.platform ?? "",
  };
}

/** True for macOS / iOS / iPadOS (where the primary chord uses ⌘ / metaKey). */
export function isApplePlatform(env?: PlatformShortcutEnv): boolean {
  const { platform, userAgent, userAgentDataPlatform } = readEnv(env);
  const haystack = `${userAgentDataPlatform} ${platform} ${userAgent}`.toLowerCase();
  return /mac|iphone|ipad|ipod|ios/.test(haystack);
}

/** Label for the primary shortcut modifier: ⌘ on Apple, Ctrl on Windows/Linux. */
export function modKeyLabel(
  env?: PlatformShortcutEnv,
  style: "symbol" | "text" = "symbol",
): string {
  if (isApplePlatform(env)) {
    return style === "text" ? "Cmd" : "⌘";
  }
  return "Ctrl";
}

/** Alt / Option label for help text. */
export function altKeyLabel(
  env?: PlatformShortcutEnv,
  style: "symbol" | "text" = "symbol",
): string {
  if (isApplePlatform(env)) {
    return style === "text" ? "Option" : "⌥";
  }
  return "Alt";
}

/** Delete chord shown in help: Mac often uses Backspace as well. */
export function deleteKeyLabel(env?: PlatformShortcutEnv): string {
  return isApplePlatform(env) ? "Delete / Backspace" : "Del";
}

/** True when the OS primary modifier is held (⌘ on Mac, Ctrl elsewhere — accept either). */
export function hasPrimaryMod(e: {
  metaKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  return Boolean(e.metaKey || e.ctrlKey);
}

/** Join primary mod + key parts, e.g. `⌘ + G` / `Ctrl + G`. */
export function formatModShortcut(
  parts: string[],
  env?: PlatformShortcutEnv,
  style: "symbol" | "text" = "symbol",
): string {
  return [modKeyLabel(env, style), ...parts].join(" + ");
}
