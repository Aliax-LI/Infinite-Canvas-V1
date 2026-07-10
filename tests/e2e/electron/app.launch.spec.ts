import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROUTES: { path: string; testId: string }[] = [
  { path: "/canvases", testId: "canvas-list-page" },
  { path: "/settings", testId: "settings-page" },
  { path: "/settings/api", testId: "api-settings-page" },
  { path: "/settings/workflows", testId: "workflows-settings-page" },
  { path: "/settings/cli", testId: "cli-settings-page" },
  { path: "/assets", testId: "asset-manager-page" },
  { path: "/chat", testId: "chat-page" },
  { path: "/tools", testId: "tools-hub-page" },
  { path: "/enhance", testId: "enhance-page" },
  { path: "/klein", testId: "klein-page" },
  { path: "/zimage", testId: "zimage-page" },
  { path: "/angle", testId: "angle-page" },
  { path: "/online", testId: "online-page" },
];

let electronApp: ElectronApplication;
let mainWindow: Page;
let appOrigin: string;
let backendPort: number;
let testRoot: string;

async function openRoute(route: string) {
  await mainWindow.evaluate((nextRoute) => {
    window.history.pushState({}, "", nextRoute);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, route);
}

test.beforeAll(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), "infinite-canvas-electron-"));
  const userDataDir = path.join(testRoot, "electron-user-data");
  const backendDataDir = path.join(testRoot, "backend-data");
  const apiEnvFile = path.join(testRoot, "API", ".env");
  await mkdir(userDataDir, { recursive: true });
  await mkdir(backendDataDir, { recursive: true });
  await mkdir(path.dirname(apiEnvFile), { recursive: true });

  electronApp = await electron.launch({
    args: [path.resolve(process.cwd())],
    env: {
      ...process.env,
      INFINITE_CANVAS_TEST: "1",
      INFINITE_CANVAS_TEST_USER_DATA: userDataDir,
      INFINITE_CANVAS_DATA_DIR: backendDataDir,
      INFINITE_CANVAS_API_ENV_FILE: apiEnvFile,
      INFINITE_CANVAS_TEST_FORCE_UPDATE: "1",
      INFINITE_CANVAS_TEST_CLI_INSTALLED: "1",
      INFINITE_CANVAS_PYTHON:
        process.env.INFINITE_CANVAS_PYTHON ??
        (process.platform === "win32" ? "python" : "python3"),
    },
  });

  mainWindow = await electronApp.firstWindow({ timeout: 120_000 });
  await mainWindow.waitForLoadState("domcontentloaded");
  appOrigin = new URL(mainWindow.url()).origin;
});

test.afterAll(async () => {
  await electronApp?.close();
  if (backendPort) {
    await expect
      .poll(
        async () => {
          try {
            await fetch(`http://127.0.0.1:${backendPort}/api/app-info`, {
              signal: AbortSignal.timeout(250),
            });
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 10_000 },
      )
      .toBe(false);
  }
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

test.describe("Electron desktop harness", () => {
  test("launches the real Electron renderer with the preload bridge", async () => {
    const rendererState = await mainWindow.evaluate(() => ({
      isElectron: (window as any).infiniteCanvasDesktop?.isElectron,
      hasNodeRequire: typeof (window as any).require !== "undefined",
    }));

    expect(rendererState).toEqual({
      isElectron: true,
      hasNodeRequire: false,
    });
  });

  test("starts and exposes the FastAPI backend through IPC", async () => {
    const status = await mainWindow.evaluate(() =>
      (window as any).infiniteCanvasDesktop.backendStatus(),
    );

    expect(status.running).toBe(true);
    expect(status.restarting).toBe(false);
    expect(status.port).toBeGreaterThan(0);
    backendPort = status.port;
    expect(appOrigin).toBe(`http://127.0.0.1:${status.port}`);

    const appInfo = await mainWindow.evaluate(async () => {
      const response = await fetch("/api/app-info");
      return { status: response.status, body: await response.json() };
    });
    expect(appInfo.status).toBe(200);
    expect(appInfo.body.is_electron).toBe(true);
  });

  test("uses an isolated backend data directory", async () => {
    const created = await mainWindow.evaluate(async () => {
      const response = await fetch("/api/canvases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Electron test canvas", kind: "smart" }),
      });
      return response.json();
    });
    expect(created.canvas.title).toBe("Electron test canvas");
  });
});

test.describe("React routes inside Electron", () => {
  for (const { path: route, testId } of ROUTES) {
    test(`${route} loads in the Electron window`, async () => {
      await openRoute(route);
      await expect(mainWindow.getByTestId(testId)).toBeVisible({ timeout: 15_000 });
      expect(new URL(mainWindow.url()).origin).toBe(appOrigin);
    });
  }

  test("shell sidebar navigation works", async () => {
    await openRoute("/canvases");
    await expect(mainWindow.getByTestId("shell-layout")).toBeVisible();
    await mainWindow.getByTestId("nav-settings").click();
    await expect(mainWindow).toHaveURL(/\/settings/);
  });

  test("settings tabs navigate inside the Electron renderer", async () => {
    await openRoute("/settings/api");
    await expect(mainWindow.getByTestId("api-settings-page")).toBeVisible();
    await mainWindow.getByTestId("settings-tab-workflows").click();
    await expect(mainWindow.getByTestId("workflows-settings-page")).toBeVisible();
  });
});

test.describe("Desktop canvas flow", () => {
  test("creates a canvas, adds nodes, connects them, and undoes", async () => {
    await openRoute("/canvases");
    await mainWindow.getByTestId("new-canvas-btn").click();
    await expect(mainWindow).toHaveURL(/\/canvas\/.+/, { timeout: 15_000 });
    await expect(mainWindow.getByTestId("smart-canvas-page")).toBeVisible();

    await mainWindow.getByTestId("add-node-btn").click();
    await mainWindow.getByTestId("add-node-btn").click();
    const cards = mainWindow.locator("[data-testid^='node-card-']");
    await expect(cards).toHaveCount(2);

    await mainWindow.getByTestId("arrange-btn").click();
    await mainWindow.getByTestId("connect-mode-btn").click();
    const ports = mainWindow.locator("[data-testid^='connect-port-']");
    await expect(ports).toHaveCount(2);
    await ports.nth(0).click({ force: true });
    await ports.nth(1).click({ force: true });
    await expect(mainWindow.getByTestId("connection-layer").locator("line")).toHaveCount(1);

    await mainWindow.getByTestId("undo-btn").click();
    await expect(mainWindow.getByTestId("connection-layer").locator("line")).toHaveCount(0);
  });
});

test.describe("Desktop update notification", () => {
  test("shows update badge when backend reports update_available", async () => {
    await mainWindow.setViewportSize({ width: 1280, height: 720 });
    await openRoute("/canvases");
    await expect(mainWindow.getByTestId("update-badge")).toBeVisible({ timeout: 15_000 });

    const screenshotPath = path.join(
      process.cwd(),
      ".audit/migration-completeness-2026-07-10",
      "compare-update-badge-electron-1280x720.png",
    );
    await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  });
});

test.describe("Desktop CLI settings", () => {
  test("shows installed CLI status from backend installed field", async () => {
    await mainWindow.setViewportSize({ width: 1280, height: 720 });
    await openRoute("/settings/cli");
    await expect(mainWindow.getByTestId("cli-settings-page")).toBeVisible({ timeout: 15_000 });
    await expect(mainWindow.getByTestId("cli-status-codex")).toHaveText("已安装");
    await expect(mainWindow.getByTestId("cli-status-gemini")).toHaveText("已安装");
    await expect(mainWindow.getByTestId("cli-status-jimeng")).toHaveText("未登录");

    const screenshotPath = path.join(
      process.cwd(),
      ".audit/migration-completeness-2026-07-10",
      "compare-cli-settings-electron-1280x720.png",
    );
    await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  });
});

test.describe("Desktop settings UI", () => {
  test("api settings page uses legacy workspace layout", async () => {
    await mainWindow.setViewportSize({ width: 1280, height: 720 });
    await openRoute("/settings/api");
    await expect(mainWindow.getByTestId("api-settings-page")).toBeVisible({ timeout: 15_000 });
    await expect(mainWindow.locator(".studio-workspace-layout")).toBeVisible();
    await expect(mainWindow.locator(".studio-workspace-sidebar")).toBeVisible();
    await expect(mainWindow.getByText("生图模型")).toBeVisible();

    const screenshotPath = path.join(
      process.cwd(),
      ".audit/migration-completeness-2026-07-10",
      "compare-api-settings-electron-1280x720.png",
    );
    await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  });

  test("workflows settings page uses legacy workspace layout", async () => {
    await mainWindow.setViewportSize({ width: 1280, height: 720 });
    await openRoute("/settings/workflows");
    await expect(mainWindow.getByTestId("workflows-settings-page")).toBeVisible({ timeout: 15_000 });
    await expect(mainWindow.locator(".studio-workspace-layout")).toBeVisible();
    await expect(mainWindow.getByTestId("workflow-graph-svg")).toBeVisible();

    const screenshotPath = path.join(
      process.cwd(),
      ".audit/migration-completeness-2026-07-10",
      "compare-workflows-settings-electron-1280x720.png",
    );
    await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  });

  test("general settings page uses about card layout", async () => {
    await mainWindow.setViewportSize({ width: 1280, height: 720 });
    await openRoute("/settings");
    await expect(mainWindow.getByTestId("settings-page")).toBeVisible({ timeout: 15_000 });
    await expect(mainWindow.locator(".studio-settings-about-grid")).toBeVisible();

    const screenshotPath = path.join(
      process.cwd(),
      ".audit/migration-completeness-2026-07-10",
      "compare-general-settings-electron-1280x720.png",
    );
    await mainWindow.screenshot({ path: screenshotPath, fullPage: false });
  });
});

test.describe("Desktop chat and tool controls", () => {
  test("switches chat modes and opens settings", async () => {
    await openRoute("/chat");
    await mainWindow.getByTestId("chat-mode-agent").click();
    await expect(mainWindow.getByTestId("chat-mode-agent")).toHaveClass(/bg-black/);
    await mainWindow.getByTestId("chat-settings-toggle").click();
    await expect(mainWindow.getByTestId("chat-settings-panel")).toBeVisible();
  });

  test("shows the migrated tool controls inside Electron", async () => {
    await openRoute("/enhance");
    await expect(mainWindow.getByTestId("enhance-upload")).toBeVisible();
    await expect(mainWindow.getByTestId("enhance-strength")).toBeVisible();

    await openRoute("/angle");
    await expect(mainWindow.getByTestId("angle-camera-stub")).toBeVisible();
    await expect(mainWindow.getByTestId("angle-rotation")).toBeVisible();
  });
});
