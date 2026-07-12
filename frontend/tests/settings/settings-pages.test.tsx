import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "../../src/shared/i18n";
import { ApiSettingsPage } from "../../src/features/settings/api/ApiSettingsPage";
import { WorkflowsSettingsPage } from "../../src/features/settings/workflows/WorkflowsSettingsPage";
import { CliSettingsPanel } from "../../src/features/settings/cli/CliSettingsPanel";
import { SettingsLayout } from "../../src/features/settings/SettingsLayout";
import { SettingsGeneralPage } from "../../src/features/settings/SettingsGeneralPage";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock("../../src/features/update/hooks", () => ({
  useAppInfo: vi.fn(() => ({ data: { version: "2026.07.10", repo_url: "https://github.com/example" } })),
  useCheckUpdate: vi.fn(() => ({
    data: { updateAvailable: false, latestVersion: "2026.07.10" },
    refetch: vi.fn(),
    isFetching: false,
  })),
}));

import { api } from "../../src/shared/api/client";

function wrap(ui: React.ReactElement, route = "/settings/api") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function isBefore(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function expectHorizontalAction(el: Element) {
  expect(el.classList.contains("studio-key-action-btn")).toBe(true);
  expect(el.closest(".studio-key-action-stack")).toBeTruthy();
}

describe("ApiSettingsPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockResolvedValue({ providers: [] });
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "p1",
          name: "Test API",
          base_url: "http://localhost",
          protocol: "openai",
          enabled: true,
          image_models: ["gpt-image"],
          chat_models: [],
          video_models: [],
          has_key: true,
          key_preview: "••••••••1234",
        },
      ],
    });
  });

  it("renders provider list and model categories", async () => {
    wrap(<ApiSettingsPage />);
    expect(await screen.findByTestId("api-settings-page")).toBeTruthy();
    expect(await screen.findByTestId("provider-row-p1")).toBeTruthy();
    expect(await screen.findByText("生图模型")).toBeTruthy();
    expect(document.querySelector(".studio-provider-drag-handle")).toBeTruthy();
  });

  it("shows add form when toggled", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("api-settings-page");
    expect(screen.queryByTestId("provider-name-input")).toBeNull();
    fireEvent.click(screen.getByTestId("provider-toggle-add-form"));
    expect(await screen.findByTestId("provider-name-input")).toBeTruthy();
    expect(await screen.findByTestId("provider-protocol-input")).toBeTruthy();
  });

  it("saves api key independently", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    fireEvent.change(screen.getByTestId("provider-key-editor"), { target: { value: "sk-test-key" } });
    fireEvent.click(screen.getByTestId("provider-save-key-btn"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    expect(await screen.findByTestId("api-settings-save-dialog")).toBeTruthy();
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{ id: string; api_key?: string }>;
    const target = payload.find((p) => p.id === "p1");
    expect(target?.api_key).toBe("sk-test-key");
  });

  it("header Save persists pending api key without requiring checkmark", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    fireEvent.change(screen.getByTestId("provider-key-editor"), {
      target: { value: "sk-from-header-save" },
    });
    fireEvent.click(screen.getByTestId("provider-save-p1"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{ id: string; api_key?: string }>;
    expect(payload.find((p) => p.id === "p1")?.api_key).toBe("sk-from-header-save");
    expect(await screen.findByTestId("api-settings-save-dialog")).toBeTruthy();
  });

  it("header Save persists pending volcengine AK/SK drafts", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "volcengine",
          name: "火山引擎",
          base_url: "https://ark.cn-beijing.volces.com/api/v3",
          protocol: "volcengine",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: true,
          key_preview: "••••ark",
          has_volcengine_access_key: false,
          has_volcengine_secret_key: false,
        },
      ],
    });
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-volcengine");
    fireEvent.change(screen.getByTestId("provider-key-editor"), {
      target: { value: "ark-key-draft" },
    });
    fireEvent.change(screen.getByTestId("provider-volc-ak-editor"), {
      target: { value: "AKLT-draft" },
    });
    fireEvent.change(screen.getByTestId("provider-volc-sk-editor"), {
      target: { value: "SK-draft" },
    });
    fireEvent.click(screen.getByTestId("provider-save-volcengine"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{
      id: string;
      api_key?: string;
      volcengine_access_key_id?: string;
      volcengine_secret_access_key?: string;
    }>;
    const volc = payload.find((p) => p.id === "volcengine");
    expect(volc?.api_key).toBe("ark-key-draft");
    expect(volc?.volcengine_access_key_id).toBe("AKLT-draft");
    expect(volc?.volcengine_secret_access_key).toBe("SK-draft");
  });

  it("clears api key with confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    fireEvent.click(screen.getByTestId("provider-clear-key-btn"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{ id: string; clear_key?: boolean }>;
    expect(payload.find((p) => p.id === "p1")?.clear_key).toBe(true);
  });

  it("opens grouped recommend api overlay and closes with Escape", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("api-settings-page");
    fireEvent.click(screen.getByTestId("provider-recommend-btn"));
    expect(await screen.findByTestId("provider-recommend-overlay")).toBeTruthy();
    expect(await screen.findByTestId("recommend-group-stable")).toBeTruthy();
    expect(await screen.findByTestId("recommend-preset-exellome")).toBeTruthy();
    expect(await screen.findByTestId("recommend-save-exellome")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("provider-recommend-overlay")).toBeNull();
    });
  });

  it("applies recommend preset with optional key", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("api-settings-page");
    fireEvent.click(screen.getByTestId("provider-recommend-btn"));
    fireEvent.change(await screen.findByTestId("recommend-key-exellome"), {
      target: { value: "sk-rec" },
    });
    fireEvent.click(screen.getByTestId("recommend-save-exellome"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{ id: string; api_key?: string }>;
    expect(payload.find((p) => p.id === "exellome")?.api_key).toBe("sk-rec");
  });

  it("renders recommend register links with correct hrefs", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("api-settings-page");
    fireEvent.click(screen.getByTestId("provider-recommend-btn"));
    await screen.findByTestId("recommend-preset-exellome");

    const exellomeLink = screen.getByTestId("recommend-register-exellome");
    expect(exellomeLink.getAttribute("href")).toBe("https://new.exellome.online/register?aff=r2dZ");
    expect(exellomeLink.getAttribute("target")).toBe("_blank");

    const apimartGlobal = screen.getByTestId("recommend-register-global-apimart");
    const apimartCn = screen.getByTestId("recommend-register-cn-apimart");
    expect(apimartGlobal.getAttribute("href")).toBe("https://apimart.ai/zh/register?aff=1uyAbb");
    expect(apimartCn.getAttribute("href")).toBe("https://apib.ai/register?aff=1uyAbb");
  });

  it("does not fetch models without a saved or typed key", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "p-no-key",
          name: "No Key API",
          base_url: "http://localhost",
          protocol: "openai",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: false,
        },
      ],
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p-no-key");
    expect((screen.getByTestId("provider-open-picker-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("provider-fetch-models-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("api-settings-notice-dialog")).toBeTruthy();
    });
    expect(screen.getByTestId("api-settings-notice-dialog").textContent).toContain("请先填写 Key");
    fireEvent.click(screen.getByTestId("api-settings-notice-dialog-confirm"));
    await waitFor(() => {
      expect(screen.queryByTestId("api-settings-notice-dialog")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("provider-open-picker-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("api-settings-notice-dialog")).toBeTruthy();
    });
    expect(screen.getByTestId("api-settings-notice-dialog").textContent).toContain("请先拉取模型");
  });

  it("fetch opens model picker after successful fetch", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/providers") {
        return Promise.resolve({
          providers: [
            {
              id: "p1",
              name: "Test API",
              base_url: "http://localhost",
              protocol: "openai",
              enabled: true,
              image_models: ["gpt-image"],
              chat_models: [],
              video_models: [],
              has_key: true,
            },
          ],
        });
      }
      if (path === "/api/providers/p1/fetch-models") {
        return Promise.resolve({
          total: 3,
          all: ["gpt-image", "gpt-4o", "sora-2"],
          image_models: ["gpt-image"],
          chat_models: ["gpt-4o"],
          video_models: ["sora-2"],
        });
      }
      return Promise.resolve({});
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    expect((screen.getByTestId("provider-open-picker-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("provider-fetch-models-btn"));
    expect(await screen.findByTestId("provider-model-picker-overlay")).toBeTruthy();
    expect(await screen.findByTestId("model-picker-row-gpt-image")).toBeTruthy();
    expect(await screen.findByTestId("model-picker-row-gpt-4o")).toBeTruthy();
    expect(await screen.findByTestId("model-picker-row-sora-2")).toBeTruthy();
    expect((screen.getByTestId("provider-open-picker-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("reopens model picker from select models button", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/providers") {
        return Promise.resolve({
          providers: [
            {
              id: "p1",
              name: "Test API",
              base_url: "http://localhost",
              protocol: "openai",
              enabled: true,
              image_models: ["gpt-image"],
              chat_models: [],
              video_models: [],
              has_key: true,
            },
          ],
        });
      }
      if (path === "/api/providers/p1/fetch-models") {
        return Promise.resolve({
          total: 2,
          all: ["gpt-image", "gpt-4o"],
          image_models: ["gpt-image"],
          chat_models: ["gpt-4o"],
          video_models: [],
        });
      }
      return Promise.resolve({});
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    fireEvent.click(screen.getByTestId("provider-fetch-models-btn"));
    await screen.findByTestId("provider-model-picker-overlay");
    fireEvent.click(screen.getByTestId("model-picker-cancel"));
    await waitFor(() => {
      expect(screen.queryByTestId("provider-model-picker-overlay")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("provider-open-picker-btn"));
    expect(await screen.findByTestId("provider-model-picker-overlay")).toBeTruthy();
    expect(await screen.findByTestId("model-picker-row-gpt-4o")).toBeTruthy();
  });

  it("applies selected models from picker", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/providers") {
        return Promise.resolve({
          providers: [
            {
              id: "p1",
              name: "Test API",
              base_url: "http://localhost",
              protocol: "openai",
              enabled: true,
              image_models: ["gpt-image"],
              chat_models: [],
              video_models: [],
              has_key: true,
            },
          ],
        });
      }
      if (path === "/api/providers/p1/fetch-models") {
        return Promise.resolve({
          total: 3,
          all: ["gpt-image", "gpt-4o", "sora-2"],
          image_models: ["gpt-image"],
          chat_models: ["gpt-4o"],
          video_models: ["sora-2"],
        });
      }
      return Promise.resolve({});
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    fireEvent.click(screen.getByTestId("provider-fetch-models-btn"));
    await screen.findByTestId("provider-model-picker-overlay");

    fireEvent.click(screen.getByTestId("model-picker-row-gpt-4o"));
    fireEvent.click(screen.getByTestId("model-picker-row-sora-2"));
    fireEvent.click(screen.getByTestId("model-picker-apply"));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{
      id: string;
      image_models?: string[];
      chat_models?: string[];
      video_models?: string[];
    }>;
    const target = payload.find((p) => p.id === "p1");
    expect(target?.image_models).toEqual(["gpt-image"]);
    expect(target?.chat_models).toEqual(["gpt-4o"]);
    expect(target?.video_models).toEqual(["sora-2"]);
    await waitFor(() => {
      expect(screen.queryByTestId("provider-model-picker-overlay")).toBeNull();
    });
  });

  it("clears fetched models when switching providers", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/providers") {
        return Promise.resolve({
          providers: [
            {
              id: "p1",
              name: "Test API",
              base_url: "http://localhost",
              protocol: "openai",
              enabled: true,
              image_models: [],
              chat_models: [],
              video_models: [],
              has_key: true,
            },
            {
              id: "p2",
              name: "Other API",
              base_url: "http://other",
              protocol: "openai",
              enabled: true,
              image_models: [],
              chat_models: [],
              video_models: [],
              has_key: true,
            },
          ],
        });
      }
      if (path === "/api/providers/p1/fetch-models") {
        return Promise.resolve({
          total: 1,
          all: ["gpt-4o"],
          image_models: [],
          chat_models: ["gpt-4o"],
          video_models: [],
        });
      }
      return Promise.resolve({});
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");
    fireEvent.click(screen.getByTestId("provider-fetch-models-btn"));
    await screen.findByTestId("provider-model-picker-overlay");
    fireEvent.click(screen.getByTestId("model-picker-cancel"));
    await waitFor(() => {
      expect(screen.queryByTestId("provider-model-picker-overlay")).toBeNull();
    });
    expect((screen.getByTestId("provider-open-picker-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("provider-row-p2"));
    await screen.findByTestId("provider-editor-p2");
    expect(screen.queryByTestId("provider-model-picker-overlay")).toBeNull();

    fireEvent.click(screen.getByTestId("provider-open-picker-btn"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/providers/p2/fetch-models");
    });
  });

  it("opens category picker from add model button and auto-fetches", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/providers") {
        return Promise.resolve({
          providers: [
            {
              id: "volcengine",
              name: "火山引擎",
              base_url: "https://ark.cn-beijing.volces.com/api/v3",
              protocol: "volcengine",
              enabled: true,
              image_models: [],
              chat_models: [],
              video_models: [],
              has_key: true,
            },
          ],
        });
      }
      if (path === "/api/providers/volcengine/fetch-models") {
        return Promise.resolve({
          total: 2,
          image_models: ["doubao-image"],
          chat_models: ["doubao-pro"],
          video_models: ["doubao-seedance"],
        });
      }
      return Promise.resolve({});
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-volcengine");
    fireEvent.click(screen.getByTestId("provider-add-video_models"));
    expect(await screen.findByTestId("provider-model-picker-overlay")).toBeTruthy();
    expect(screen.getByTestId("model-picker-tab-video").classList.contains("active")).toBe(true);
    expect(await screen.findByTestId("model-picker-row-doubao-seedance")).toBeTruthy();
  });

  it("add model button prompts before fetch when key is missing", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          base_url: "https://api-inference.modelscope.cn/v1",
          protocol: "openai",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: false,
        },
      ],
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-modelscope");
    fireEvent.click(screen.getByTestId("provider-add-image_models"));
    await waitFor(() => {
      expect(screen.getByTestId("api-settings-notice-dialog")).toBeTruthy();
    });
    expect(screen.getByTestId("api-settings-notice-dialog").textContent).toContain("请先拉取模型");
    expect(
      vi.mocked(api.get).mock.calls.some(([path]) => String(path).includes("/fetch-models")),
    ).toBe(false);
  });

  it("shows protocol-specific key acquisition links for fixed providers", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          base_url: "https://api-inference.modelscope.cn/v1",
          protocol: "openai",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: false,
        },
        {
          id: "runninghub",
          name: "RunningHub",
          base_url: "https://www.runninghub.cn",
          protocol: "runninghub",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: false,
        },
        {
          id: "volcengine",
          name: "火山引擎",
          base_url: "https://ark.cn-beijing.volces.com/api/v3",
          protocol: "volcengine",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: false,
        },
      ],
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-modelscope");

    const msTabs = screen.getByTestId("provider-key-link-ms-tabs");
    const msUrl = screen.getByTestId("provider-url-modelscope");
    const msKey = screen.getByTestId("provider-key-editor");
    const msGetKey = screen.getByTestId("provider-key-link-ms-0-cn");
    const msVerify = screen.getByTestId("provider-verify-address-modelscope");
    expect(isBefore(msTabs, msUrl)).toBe(true);
    expect(isBefore(msUrl, msKey)).toBe(true);
    expect(isBefore(msKey, msGetKey)).toBe(true);
    expect(isBefore(msGetKey, msVerify)).toBe(true);
    expect(msGetKey.closest(".studio-key-action-stack")).toBe(msVerify.closest(".studio-key-action-stack"));
    expect(screen.queryByTestId("provider-key-link-ms-region-hint")).toBeNull();
    expectHorizontalAction(msGetKey);
    expectHorizontalAction(msVerify);
    expect(msTabs.classList.contains("studio-key-region-tabs")).toBe(true);

    expect(screen.getByTestId("provider-key-link-ms-0-cn").getAttribute("href")).toBe(
      "https://www.modelscope.cn/my/access/token",
    );
    fireEvent.click(screen.getByTestId("provider-key-link-ms-tab-global"));
    expect(screen.getByTestId("provider-key-link-ms-0-global").getAttribute("href")).toBe(
      "https://www.modelscope.ai/my/access/token",
    );

    fireEvent.click(screen.getByTestId("provider-row-runninghub"));
    await screen.findByTestId("provider-editor-runninghub");
    const rhTabs = screen.getByTestId("provider-key-link-rh-tabs");
    const rhUrl = screen.getByTestId("provider-url-runninghub");
    const rhKey = screen.getByTestId("provider-key-editor");
    const rhCoin = screen.getByTestId("provider-key-link-rh-0-cn");
    const rhVerify = screen.getByTestId("provider-verify-address-runninghub");
    expect(isBefore(rhTabs, rhUrl)).toBe(true);
    expect(isBefore(rhUrl, rhKey)).toBe(true);
    expect(isBefore(rhKey, rhCoin)).toBe(true);
    expect(isBefore(rhCoin, rhVerify)).toBe(true);
    expect(rhCoin.closest(".studio-key-action-stack")).toBe(rhVerify.closest(".studio-key-action-stack"));
    expectHorizontalAction(rhCoin);
    expectHorizontalAction(screen.getByTestId("provider-key-link-rh-1-cn"));
    expectHorizontalAction(rhVerify);

    expect(screen.getByTestId("provider-key-link-rh-0-cn").getAttribute("href")).toContain(
      "runninghub.cn/enterprise-api/consumerApi",
    );
    fireEvent.click(screen.getByTestId("provider-key-link-rh-tab-global"));
    expect(screen.getByTestId("provider-key-link-rh-0-global").getAttribute("href")).toContain(
      "runninghub.ai/enterprise-api/consumerApi",
    );
    expect(screen.getByTestId("provider-key-link-rh-1-global").getAttribute("href")).toContain(
      "runninghub.ai/enterprise-api/sharedApi",
    );

    fireEvent.click(screen.getByTestId("provider-row-volcengine"));
    await screen.findByTestId("provider-editor-volcengine");
    const volcUrl = screen.getByTestId("provider-url-volcengine");
    const volcKey = screen.getByTestId("provider-key-editor");
    const volcArk = screen.getByTestId("provider-key-link-volc-ark");
    const volcVerify = screen.getByTestId("provider-verify-address-volcengine");
    expect(isBefore(volcUrl, volcKey)).toBe(true);
    expect(isBefore(volcKey, volcArk)).toBe(true);
    expect(isBefore(volcArk, volcVerify)).toBe(true);
    expect(volcArk.closest(".studio-key-action-stack")).toBe(volcVerify.closest(".studio-key-action-stack"));
    expectHorizontalAction(volcArk);
    expectHorizontalAction(screen.getByTestId("provider-key-link-volc-iam"));
    expectHorizontalAction(volcVerify);

    expect(screen.getByTestId("provider-key-link-volc-ark").getAttribute("href")).toContain(
      "console.volcengine.com/ark",
    );
    expect(screen.getByTestId("provider-key-link-volc-iam").getAttribute("href")).toContain(
      "console.volcengine.com/iam/keymanage",
    );
  });

  it("hides protocol selector for fixed and CLI providers", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          base_url: "https://api-inference.modelscope.cn/v1",
          protocol: "openai",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
        },
        {
          id: "p-cli",
          name: "Codex CLI",
          protocol: "codex",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
        },
        {
          id: "p-custom",
          name: "Custom API",
          base_url: "https://api.example.com/v1",
          protocol: "openai",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
        },
      ],
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-modelscope");
    expect(screen.queryByTestId("provider-protocol-modelscope")).toBeNull();
    expect(screen.queryByTestId("provider-verify-protocol-modelscope")).toBeNull();
    expect(screen.getByTestId("provider-verify-address-modelscope")).toBeTruthy();

    fireEvent.click(screen.getByTestId("provider-row-p-cli"));
    await screen.findByTestId("provider-editor-p-cli");
    expect(screen.queryByTestId("provider-protocol-p-cli")).toBeNull();
    expect(screen.queryByTestId("provider-key-editor")).toBeNull();
    expect(screen.getByTestId("provider-cli-hint-codex")).toBeTruthy();
    expect(screen.getByTestId("provider-cli-settings-link")).toBeTruthy();

    fireEvent.click(screen.getByTestId("provider-row-p-custom"));
    await screen.findByTestId("provider-editor-p-custom");
    expect(screen.getByTestId("provider-protocol-p-custom")).toBeTruthy();
    expect(screen.getByTestId("provider-verify-protocol-p-custom")).toBeTruthy();
  });

  it("calls verify address and protocol endpoints for custom providers", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "p1",
          name: "Test API",
          base_url: "http://localhost/v1",
          protocol: "openai",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
          has_key: true,
        },
      ],
    });
    vi.mocked(api.post).mockResolvedValue({
      ok: true,
      model_count: 2,
      all: ["gpt-4o", "gpt-image"],
      message: "ok",
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-p1");

    fireEvent.click(screen.getByTestId("provider-verify-address-p1"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/providers/test-connection", {
        base_url: "http://localhost/v1",
        api_key: "",
        protocol: "openai",
        provider_id: "p1",
      });
    });
    expect(await screen.findByTestId("provider-verify-dialog")).toBeTruthy();
    const verifyResult = await screen.findByTestId("provider-verify-result");
    expect(verifyResult.textContent).toContain("地址验证通过");
    expect(verifyResult.textContent).toContain("找到 2 个模型");
    expect((screen.getByTestId("provider-open-picker-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("provider-verify-dialog-confirm"));
    await waitFor(() => {
      expect(screen.queryByTestId("provider-verify-dialog")).toBeNull();
    });

    vi.mocked(api.post).mockResolvedValue({
      ok: true,
      protocol: "apimart",
      status_code: 400,
      message: "APIMart 异步任务端点可用",
      raw: { error: { message: "invalid task id" } },
    });
    fireEvent.click(screen.getByTestId("provider-verify-protocol-p1"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/providers/probe-async", {
        base_url: "http://localhost/v1",
        api_key: "",
        protocol: "openai",
        provider_id: "p1",
      });
    });
    expect(await screen.findByTestId("provider-verify-dialog")).toBeTruthy();
    expect(screen.getByTestId("provider-verify-result").textContent).toContain("APIMart 异步任务端点可用");
  });

  it("limits add-platform protocol options to custom protocols", async () => {
    wrap(<ApiSettingsPage />);
    await screen.findByTestId("api-settings-page");
    fireEvent.click(screen.getByTestId("provider-toggle-add-form"));
    const protocolSelect = await screen.findByTestId("provider-protocol-input");
    expect(protocolSelect.textContent).toContain("OpenAI 直连");
    expect(protocolSelect.textContent).not.toContain("火山引擎");
    expect(protocolSelect.textContent).not.toContain("即梦 CLI");
  });

  it("shows LoRA section only for ModelScope", async () => {
    vi.mocked(api.get).mockResolvedValue({
      providers: [
        {
          id: "modelscope",
          name: "ModelScope",
          base_url: "https://api-inference.modelscope.cn/v1",
          protocol: "openai",
          enabled: true,
          image_models: ["Tongyi-MAI/Z-Image-Turbo"],
          chat_models: [],
          video_models: [],
          ms_loras: [],
        },
        {
          id: "volcengine",
          name: "火山引擎",
          base_url: "https://ark.cn-beijing.volces.com/api/v3",
          protocol: "volcengine",
          enabled: true,
          image_models: [],
          chat_models: [],
          video_models: [],
        },
      ],
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-modelscope");
    expect(screen.getByTestId("ms-lora-section")).toBeTruthy();
    expect(screen.getByTestId("ms-lora-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("provider-row-volcengine"));
    await screen.findByTestId("provider-editor-volcengine");
    expect(screen.queryByTestId("ms-lora-section")).toBeNull();
  });

  it("adds and deletes LoRA rows with bound model dropdown options", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (String(url).includes("fetch-loras")) {
        return {
          items: [{ id: "catalog/lora-a", name: "热门 LoRA A" }],
          total: 120,
          page_number: 1,
          page_size: 16,
          sub_vision_foundation: "Z_IMAGE_TURBO",
        };
      }
      return {
        providers: [
          {
            id: "modelscope",
            name: "ModelScope",
            base_url: "https://api-inference.modelscope.cn/v1",
            protocol: "openai",
            enabled: true,
            image_models: ["Tongyi-MAI/Z-Image-Turbo"],
            chat_models: [],
            video_models: [],
            ms_loras: [
              {
                id: "Daniel8152/film",
                target_model: "Tongyi-MAI/Z-Image-Turbo",
                strength: 0.8,
              },
            ],
          },
        ],
      };
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("ms-lora-row-0");
    expect(screen.getByTestId("ms-lora-target-0").textContent).toContain("Tongyi-MAI/Z-Image-Turbo");
    expect(screen.getByTestId("ms-lora-id-0").textContent).toContain("Daniel8152/film");
    await waitFor(() => {
      expect(screen.getByTestId("ms-lora-catalog-hint-0").textContent).toContain("120");
    });

    fireEvent.click(screen.getByTestId("ms-lora-add-btn"));
    expect(screen.getByTestId("ms-lora-row-1")).toBeTruthy();
    expect(screen.getByTestId("ms-lora-id-1").textContent).toContain("选择 LoRA");

    fireEvent.click(screen.getByTestId("ms-lora-id-1-trigger"));
    fireEvent.click(screen.getByTestId("ms-lora-id-1-option-catalog/lora-a"));
    expect(screen.getByTestId("ms-lora-id-1").textContent).toContain("catalog/lora-a");

    fireEvent.click(screen.getByTestId("ms-lora-delete-1"));
    expect(screen.queryByTestId("ms-lora-row-1")).toBeNull();
    expect(screen.getByTestId("ms-lora-row-0")).toBeTruthy();
  });

  it("persists ms_loras when saving ModelScope provider", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (String(url).includes("fetch-loras")) {
        return {
          items: [],
          total: 0,
          page_number: 1,
          page_size: 16,
          sub_vision_foundation: "Z_IMAGE_TURBO",
        };
      }
      return {
        providers: [
          {
            id: "modelscope",
            name: "ModelScope",
            base_url: "https://api-inference.modelscope.cn/v1",
            protocol: "openai",
            enabled: true,
            image_models: ["Tongyi-MAI/Z-Image-Turbo"],
            chat_models: [],
            video_models: [],
            ms_loras: [
              {
                id: "Daniel8152/film",
                target_model: "Tongyi-MAI/Z-Image-Turbo",
                strength: 0.8,
              },
            ],
          },
        ],
      };
    });

    wrap(<ApiSettingsPage />);
    await screen.findByTestId("provider-editor-modelscope");
    fireEvent.click(screen.getByTestId("provider-save-modelscope"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.put).mock.calls.at(-1)?.[1] as Array<{
      id: string;
      ms_loras?: Array<{ id: string; target_model: string; strength: number }>;
    }>;
    const ms = payload.find((p) => p.id === "modelscope");
    expect(ms?.ms_loras).toEqual([
      expect.objectContaining({
        id: "Daniel8152/film",
        target_model: "Tongyi-MAI/Z-Image-Turbo",
        strength: 0.8,
      }),
    ]);
  });
});

describe("WorkflowsSettingsPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/comfyui/instances") return Promise.resolve({ instances: ["127.0.0.1:8188"] });
      if (path.startsWith("/api/comfyui/status")) {
        return Promise.resolve({
          instances: [{ address: "127.0.0.1:8188", online: true, latency_ms: 15 }],
          online_count: 1,
          total: 1,
        });
      }
      if (path === "/api/workflows") return Promise.resolve({ workflows: [{ name: "test.json", title: "Test" }] });
      if (path.startsWith("/api/workflows/")) {
        return Promise.resolve({
          config: { title: "Test", fields: [] },
          workflow: {
            "1": { class_type: "CLIPTextEncode", inputs: { text: "hello", clip: ["2", 0] } },
            "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } },
          },
        });
      }
      if (path === "/api/runninghub/workflows") return Promise.resolve({ workflows: [] });
      return Promise.resolve({});
    });
    vi.mocked(api.post).mockResolvedValue({ ok: true, outputs: [] });
  });

  it("renders workflow crud section and graph", async () => {
    wrap(<WorkflowsSettingsPage />);
    expect(await screen.findByTestId("workflows-settings-page")).toBeTruthy();
    expect(await screen.findByTestId("workflow-crud-section")).toBeTruthy();
    expect(await screen.findByTestId("workflow-row-test.json")).toBeTruthy();
    expect(await screen.findByTestId("workflow-graph-svg")).toBeTruthy();
    expect(await screen.findByTestId("workflow-preview-modal-toggle")).toBeTruthy();
  });

  it("renders comfy instance rows and supports add row", async () => {
    wrap(<WorkflowsSettingsPage />);
    expect(await screen.findByTestId("comfy-instances-editor")).toBeTruthy();
    expect(await screen.findByTestId("comfy-instance-input-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("comfy-instance-add"));
    expect(await screen.findByTestId("comfy-instance-row-1")).toBeTruthy();
  });

  it("shows comfy instance online status", async () => {
    wrap(<WorkflowsSettingsPage />);
    const status = await screen.findByTestId("comfy-instance-status-0");
    expect(status.textContent).toContain("在线");
    expect(await screen.findByTestId("comfy-aggregate-status")).toHaveTextContent("全部在线（1）");
    expect(status.querySelector(".studio-comfy-status-dot.online")).toBeTruthy();
  });

  it("switches to test canvas tab", async () => {
    wrap(<WorkflowsSettingsPage />);
    await screen.findByTestId("workflow-graph-workspace");
    fireEvent.click(screen.getByTestId("workflow-tab-canvas"));
    expect(await screen.findByTestId("workflow-test-canvas")).toBeTruthy();
    expect(screen.getByTestId("workflow-run-test-btn")).toBeTruthy();
  });

  it("opens node preview modal on test canvas tab", async () => {
    wrap(<WorkflowsSettingsPage />);
    await screen.findByTestId("workflow-graph-workspace");
    fireEvent.click(screen.getByTestId("workflow-tab-canvas"));
    await screen.findByTestId("workflow-test-canvas");
    fireEvent.click(screen.getByTestId("workflow-preview-modal-toggle"));
    expect(await screen.findByTestId("workflow-preview-modal")).toBeTruthy();
  });

  it("closes node popup with Escape after clicking a graph node", async () => {
    wrap(<WorkflowsSettingsPage />);
    await screen.findByTestId("workflow-graph-svg");
    const node = document.querySelector("[data-testid^='workflow-graph-node-']");
    expect(node).toBeTruthy();
    fireEvent.click(node!);
    expect(await screen.findByTestId("workflow-node-popup")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("workflow-node-popup")).toBeNull();
    });
  });

  it("exposes fields and edits sidebar preview values", async () => {
    wrap(<WorkflowsSettingsPage />);
    await screen.findByTestId("workflow-graph-svg");
    const node = document.querySelector("[data-testid='workflow-graph-node-1']");
    expect(node).toBeTruthy();
    fireEvent.click(node!);
    await screen.findByTestId("workflow-node-popup");
    fireEvent.click(screen.getByTestId("workflow-node-toggle-text"));
    fireEvent.click(screen.getByTestId("workflow-preview-modal-toggle"));
    expect(await screen.findByTestId("workflow-preview-modal")).toBeTruthy();
    const input = await screen.findByTestId("workflow-preview-input-1_text");
    fireEvent.change(input, { target: { value: "自定义提示词" } });
    expect((input as HTMLTextAreaElement).value).toBe("自定义提示词");
  });

  it("runs test canvas with preview field values", async () => {
    wrap(<WorkflowsSettingsPage />);
    await screen.findByTestId("workflow-graph-svg");
    const node = document.querySelector("[data-testid='workflow-graph-node-1']");
    expect(node).toBeTruthy();
    fireEvent.click(node!);
    await screen.findByTestId("workflow-node-popup");
    fireEvent.click(screen.getByTestId("workflow-node-toggle-text"));
    fireEvent.click(screen.getByTestId("workflow-tab-canvas"));
    await screen.findByTestId("workflow-test-canvas");
    const promptArea = document.querySelector(".studio-mini-card textarea");
    expect(promptArea).toBeTruthy();
    fireEvent.change(promptArea!, { target: { value: "run-me" } });
    fireEvent.click(screen.getByTestId("workflow-run-test-btn"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/workflows/test.json/run",
        expect.objectContaining({
          fields: expect.objectContaining({ "1_text": "run-me" }),
        }),
      );
    });
  });
});

describe("CliSettingsPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      installed: true,
      version: "1.0",
      message: "OpenAI Codex CLI 已安装。",
    });
  });

  it("renders all cli panels", async () => {
    wrap(<CliSettingsPanel />);
    expect(await screen.findByTestId("cli-settings-page")).toBeTruthy();
    expect(await screen.findByTestId("cli-panel-codex")).toBeTruthy();
    expect(await screen.findByTestId("cli-panel-gemini")).toBeTruthy();
    expect(await screen.findByTestId("cli-panel-jimeng")).toBeTruthy();
  });
});

describe("SettingsGeneralPage", () => {
  afterEach(() => cleanup());

  it("does not duplicate theme controls in about tab", async () => {
    wrap(<SettingsGeneralPage />, "/settings");
    expect(await screen.findByTestId("settings-page")).toBeTruthy();
    expect(screen.queryByText("外观")).toBeNull();
    expect(screen.queryByTestId("language-select")).toBeNull();
    expect(await screen.findByText("版本状态")).toBeTruthy();
  });
});

describe("SettingsLayout", () => {
  afterEach(() => cleanup());

  it("lists about tab last", async () => {
    wrap(<SettingsLayout />, "/settings/api");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.at(-1)?.getAttribute("data-testid")).toBe("settings-tab-about");
    expect(screen.getByTestId("settings-tab-storage")).toBeTruthy();
  });

  it("supports arrow key tab navigation", async () => {
    wrap(
      <SettingsLayout />,
      "/settings",
    );
    const aboutTab = await screen.findByTestId("settings-tab-about");
    aboutTab.focus();
    fireEvent.keyDown(aboutTab, { key: "ArrowRight" });
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-testid")).toBe("settings-tab-api");
    });
  });
});
