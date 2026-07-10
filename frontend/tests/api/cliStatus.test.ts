import { describe, expect, it } from "vitest";
import {
  normalizeCodexCliStatus,
  normalizeGeminiCliStatus,
  normalizeJimengCliStatus,
  parseCliVersionDisplay,
} from "../../src/shared/api/cliStatus";

describe("CLI status contract", () => {
  it("maps codex installed field to legacy 已安装 label", () => {
    expect(
      normalizeCodexCliStatus({
        installed: true,
        version: "0.42.0",
        path: "/usr/local/bin/codex",
        message: "OpenAI Codex CLI 已安装。",
        image2_helper_installed: true,
      }),
    ).toMatchObject({
      label: "已安装",
      installed: true,
      ok: true,
      version: "0.42.0",
      path: "/usr/local/bin/codex",
      message: "OpenAI Codex CLI 已安装。",
      helper: { label: "GPT Image 2 helper 已安装", installed: true },
      detail: "0.42.0 · /usr/local/bin/codex · GPT Image 2 helper 已安装 · OpenAI Codex CLI 已安装。",
      image2HelperInstalled: true,
    });
  });

  it("maps codex missing CLI to 未安装", () => {
    expect(
      normalizeCodexCliStatus({
        installed: false,
        message: "未找到 OpenAI Codex CLI，请先安装。",
      }),
    ).toMatchObject({
      label: "未安装",
      installed: false,
      ok: false,
    });
  });

  it("maps gemini-cli installed field", () => {
    expect(
      normalizeGeminiCliStatus({
        installed: true,
        version: "1.2.3",
        message: "Antigravity CLI 已安装。",
      }),
    ).toMatchObject({
      label: "已安装",
      installed: true,
      ok: true,
    });
  });

  it("maps jimeng logged_in and installed like legacy api-settings.js", () => {
    expect(
      normalizeJimengCliStatus({
        installed: true,
        logged_in: true,
        cli_version: "1.4.2",
      }),
    ).toMatchObject({
      label: "已登录",
      installed: true,
      ok: true,
    });

    expect(
      normalizeJimengCliStatus({
        installed: true,
        logged_in: false,
        message: "请先登录",
      }),
    ).toMatchObject({
      label: "未登录",
      installed: true,
      ok: false,
    });

    expect(
      normalizeJimengCliStatus({
        installed: false,
        logged_in: false,
        message: "未找到 dreamina CLI",
      }),
    ).toMatchObject({
      label: "未安装",
      installed: false,
      ok: false,
    });
  });

  it("parses combined cli version strings", () => {
    expect(parseCliVersionDisplay("codex-cli 0.134.0")).toEqual({
      binary: "codex-cli",
      semver: "0.134.0",
    });
    expect(parseCliVersionDisplay("0.28.0")).toEqual({ semver: "0.28.0" });
  });

  it("surfaces jimeng version warning when version_ok is false", () => {
    const view = normalizeJimengCliStatus({
      installed: true,
      logged_in: true,
      cli_version: "1.0.0",
      version_ok: false,
      min_version: "1.4.2",
    });
    expect(view.versionWarning).toContain("1.0.0");
    expect(view.versionWarning).toContain("1.4.2");
  });
});
