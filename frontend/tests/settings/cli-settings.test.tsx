import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../src/shared/i18n";
import { CliSettingsPanel } from "../../src/features/settings/cli/CliSettingsPanel";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "../../src/shared/api/client";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CliSettingsPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/codex/status") {
        return Promise.resolve({
          installed: true,
          version: "0.42.0",
          path: "/usr/local/bin/codex",
          message: "OpenAI Codex CLI 已安装。",
          image2_helper_installed: true,
        });
      }
      if (path === "/api/gemini-cli/status") {
        return Promise.resolve({
          installed: true,
          version: "1.2.3",
          message: "Antigravity CLI 已安装。",
        });
      }
      if (path === "/api/jimeng/status") {
        return Promise.resolve({
          installed: true,
          logged_in: false,
          message: "请先登录",
        });
      }
      if (path === "/api/jimeng/login/status") {
        return Promise.resolve({
          running: false,
          logged_in: true,
          text: "登录成功",
          raw: { total_credit: 128 },
        });
      }
      return Promise.resolve({});
    });
    vi.mocked(api.post).mockResolvedValue({ text: "help output" });
  });

  it("shows structured cli info for installed codex", async () => {
    wrap(<CliSettingsPanel />);
    await screen.findByTestId("cli-panel-codex");
    expect((await screen.findByTestId("cli-version-codex")).textContent).toBe("v0.42.0");
    expect(screen.getByTestId("cli-path-codex").textContent).toContain("/usr/local/bin/codex");
    expect(screen.getByTestId("cli-helper-codex").textContent).toContain("GPT Image 2 helper");
  });

  it("shows empty state when jimeng cli is missing", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/jimeng/status") {
        return Promise.resolve({
          installed: false,
          logged_in: false,
          message: "未找到 dreamina CLI",
        });
      }
      if (path === "/api/codex/status") {
        return Promise.resolve({ installed: true, version: "0.42.0", image2_helper_installed: true });
      }
      if (path === "/api/gemini-cli/status") {
        return Promise.resolve({ installed: true, version: "1.2.3" });
      }
      return Promise.resolve({});
    });

    wrap(<CliSettingsPanel />);
    const empty = await screen.findByTestId("cli-info-jimeng");
    expect(empty.querySelector(".studio-cli-info-empty")?.textContent).toBe("未找到 dreamina CLI");
  });

  it("shows 已安装 when backend returns installed=true", async () => {
    wrap(<CliSettingsPanel />);
    expect(await screen.findByTestId("cli-settings-page")).toBeTruthy();
    expect(await screen.findByText("CLI 工具")).toBeTruthy();
    expect((await screen.findByTestId("cli-status-codex")).textContent).toBe("已安装");
    expect((await screen.findByTestId("cli-status-gemini")).textContent).toBe("已安装");
  });

  it("shows jimeng login state separately from install state", async () => {
    wrap(<CliSettingsPanel />);
    expect(await screen.findByText("未登录")).toBeTruthy();
  });

  it("hides codex image helper install when helper is already installed", async () => {
    wrap(<CliSettingsPanel />);
    await screen.findByText("已安装");
    await waitFor(() => {
      expect(screen.queryByTestId("cli-action-codex-安装 GPT Image 2 helper")).toBeNull();
    });
  });

  it("shows loading state when clicking detect CLI", async () => {
    let resolveCodex: (value: unknown) => void;
    const codexPromise = new Promise((resolve) => {
      resolveCodex = resolve;
    });

    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/codex/status") {
        return codexPromise as Promise<unknown>;
      }
      if (path === "/api/gemini-cli/status") {
        return Promise.resolve({ installed: true, version: "1.2.3" });
      }
      if (path === "/api/jimeng/status") {
        return Promise.resolve({ installed: true, logged_in: false });
      }
      return Promise.resolve({});
    });

    wrap(<CliSettingsPanel />);
    await screen.findByTestId("cli-panel-codex");

    const refreshBtn = screen.getByTestId("cli-refresh-codex");
    fireEvent.click(refreshBtn);

    expect(refreshBtn).toBeDisabled();
    expect(refreshBtn.textContent).toContain("检测中...");
    expect(refreshBtn.querySelector(".studio-icon-spin")).toBeTruthy();
    expect(screen.getByTestId("cli-status-codex").textContent).toBe("检测中...");

    resolveCodex!({
      installed: true,
      version: "0.42.0",
      path: "/usr/local/bin/codex",
      image2_helper_installed: true,
    });

    await waitFor(
      () => {
        expect(refreshBtn).not.toBeDisabled();
        expect(refreshBtn.textContent).toContain("检测 CLI");
      },
      { timeout: 1200 },
    );
  });

  it("keeps detect loading visible for a minimum duration after click", async () => {
    wrap(<CliSettingsPanel />);
    await screen.findByTestId("cli-panel-codex");
    await waitFor(() => {
      expect(screen.getByTestId("cli-status-codex").textContent).toBe("已安装");
    });

    const refreshBtn = screen.getByTestId("cli-refresh-codex");
    fireEvent.click(refreshBtn);

    expect(refreshBtn).toBeDisabled();
    expect(refreshBtn.textContent).toContain("检测中...");
    expect(refreshBtn.querySelector(".studio-icon-spin")).toBeTruthy();

    await new Promise((resolve) => window.setTimeout(resolve, 80));
    expect(refreshBtn).toBeDisabled();

    await waitFor(
      () => {
        expect(refreshBtn).not.toBeDisabled();
        expect(refreshBtn.textContent).toContain("检测 CLI");
      },
      { timeout: 1200 },
    );
  });

  it("opens help dialog and loads command output", async () => {
    wrap(<CliSettingsPanel />);
    await screen.findByTestId("cli-panel-codex");
    fireEvent.click(screen.getByTestId("cli-help-open-codex"));
    expect(await screen.findByTestId("cli-help-overlay-codex")).toBeTruthy();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/codex/help", { command: "" });
    });
    expect((await screen.findByTestId("cli-help-output-codex")).textContent).toContain("help output");
  });

  it("shows jimeng credit after querying balance", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/jimeng/credit") {
        return Promise.resolve({ success: true, raw: { total_credit: 256 } });
      }
      if (path === "/api/jimeng/status") {
        return Promise.resolve({ installed: true, logged_in: true, raw: { total_credit: 100 } });
      }
      if (path === "/api/codex/status") {
        return Promise.resolve({ installed: true, version: "0.42.0", image2_helper_installed: true });
      }
      if (path === "/api/gemini-cli/status") {
        return Promise.resolve({ installed: true, version: "1.2.3" });
      }
      return Promise.resolve({});
    });

    wrap(<CliSettingsPanel />);
    await screen.findByTestId("cli-panel-jimeng");
    expect((await screen.findByTestId("cli-credit-jimeng")).textContent).toContain("total_credit: 100");

    fireEvent.click(screen.getByTestId("cli-action-jimeng-查询积分"));
    await waitFor(() => {
      expect(screen.getByTestId("cli-credit-jimeng").textContent).toContain("total_credit: 256");
    });
  });

  it("starts jimeng login and polls until logged in", async () => {
    let jimengLoggedIn = false;
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/jimeng/status") {
        return Promise.resolve({
          installed: true,
          logged_in: jimengLoggedIn,
          raw: jimengLoggedIn ? { total_credit: 128 } : undefined,
          message: jimengLoggedIn ? undefined : "请先登录",
        });
      }
      if (path === "/api/jimeng/login/status") {
        jimengLoggedIn = true;
        return Promise.resolve({
          running: false,
          logged_in: true,
          text: "登录成功",
          raw: { total_credit: 128 },
        });
      }
      if (path === "/api/codex/status") {
        return Promise.resolve({ installed: true, version: "0.42.0", image2_helper_installed: true });
      }
      if (path === "/api/gemini-cli/status") {
        return Promise.resolve({ installed: true, version: "1.2.3" });
      }
      return Promise.resolve({});
    });
    vi.mocked(api.post).mockImplementation((path: string) => {
      if (path === "/api/jimeng/login/start") {
        return Promise.resolve({
          running: true,
          text: "请扫码",
          qr_url: "https://example.com/qr.png",
        });
      }
      return Promise.resolve({ text: "help output" });
    });

    wrap(<CliSettingsPanel />);
    await screen.findByTestId("cli-panel-jimeng");
    fireEvent.click(screen.getByTestId("cli-action-jimeng-扫码登录"));
    expect(await screen.findByTestId("cli-login-box-jimeng")).toBeTruthy();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/jimeng/login/status");
    });
    await waitFor(() => {
      expect(screen.getByTestId("cli-status-jimeng").textContent).toBe("已登录");
    });
  });
});
