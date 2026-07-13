import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssetManagerPage } from "../../src/features/asset-manager/AssetManagerPage";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    patch: vi.fn(),
    postBlob: vi.fn(),
  },
}));

import { api } from "../../src/shared/api/client";

function pickStudioOption(testId: string, value: string) {
  fireEvent.click(screen.getByTestId(`${testId}-trigger`));
  fireEvent.click(screen.getByTestId(`${testId}-option-${value}`));
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssetManagerPage />
    </QueryClientProvider>,
  );
}

const promptLibrariesPayload = {
  library: {
    active_library_id: "system",
    libraries: [
      {
        id: "system",
        name: "系统提示词库",
        readonly: false,
        system: true,
        categories: [
          { id: "view", name: "视角" },
          { id: "custom", name: "我的" },
        ],
        items: [
          {
            id: "tpl_mine_1",
            name: "新模板",
            positive: "新提示词",
            category: "custom",
            scene: "我的模板",
          },
          {
            id: "tpl_view_1",
            name: "俯拍",
            positive: "aerial city",
            category: "view",
          },
        ],
      },
      {
        id: "pl_user",
        name: "我的词库",
        readonly: false,
        categories: [{ id: "g1", name: "自定义组" }],
        items: [],
      },
    ],
  },
};

describe("AssetManagerPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/asset-library") {
        return Promise.resolve({
          library: {
            active_library_id: "lib1",
            libraries: [
              {
                id: "lib1",
                name: "默认库",
                categories: [
                  {
                    id: "c1",
                    type: "image",
                    name: "角色",
                    items: [{ id: "img1", name: "Photo", url: "/assets/library/test.png" }],
                  },
                  {
                    id: "c2",
                    type: "image",
                    name: "场景",
                    items: [],
                  },
                  {
                    id: "wf1",
                    type: "workflow",
                    name: "工作流",
                    items: [{ id: "w1", name: "Flow", url: "/assets/workflows/w1.json" }],
                  },
                ],
              },
            ],
          },
        });
      }
      if (path === "/api/local-assets") {
        return Promise.resolve({
          items: [{ id: "local1", name: "Local", url: "/assets/uploads/x.png", kind: "image" }],
        });
      }
      if (path === "/api/prompt-libraries") {
        return Promise.resolve(promptLibrariesPayload);
      }
      if (path === "/api/canvas-assets") {
        return Promise.resolve({
          categories: [
            { id: "smart", name: "智能画布", count: 1 },
            { id: "classic", name: "普通画布", count: 0 },
          ],
          canvases: [{ id: "cv1", title: "Demo Smart", kind: "smart" }],
          items: [
            {
              id: "ca1",
              name: "Canvas Asset",
              url: "/x.png",
              canvas_id: "cv1",
              canvas_kind: "smart",
              canvas_title: "Demo Smart",
            },
          ],
        });
      }
      if (path === "/api/providers") {
        return Promise.resolve({
          providers: [
            {
              id: "openai",
              name: "OpenAI",
              enabled: true,
              chat_models: ["gpt-3.5-turbo", "gpt-4o"],
            },
          ],
        });
      }
      if (path === "/api/asset-library/annotation-settings") {
        return Promise.resolve({
          settings: { provider: "openai", model: "gpt-4o", ms_model: "", prompt: "focus style" },
        });
      }
      return Promise.resolve({});
    });
    vi.mocked(api.patch).mockResolvedValue({});
    vi.mocked(api.post).mockResolvedValue({});
  });

  it("renders 5 tabs with subtitle and refresh", () => {
    wrap();
    expect(screen.getByTestId("asset-manager-page")).toBeTruthy();
    expect(screen.getByTestId("asset-manager-page").className).toContain("studio-asset-shell");
    expect(screen.getByTestId("asset-tab-images")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-images").className).toContain("active");
    expect(screen.getByTestId("asset-tab-workflows")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-prompts")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-canvas-assets")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-local-media")).toBeTruthy();
    expect(screen.getByTestId("asset-manager-refresh")).toBeTruthy();
  });

  it("shows three-column images browser by default", async () => {
    wrap();
    expect(await screen.findByTestId("asset-tab-panel-images")).toBeTruthy();
    expect(await screen.findByTestId("asset-library-browser")).toBeTruthy();
    expect(await screen.findByTestId("asset-library-browser-nav")).toBeTruthy();
    expect(await screen.findByTestId("asset-library-browser-content")).toBeTruthy();
    expect(await screen.findByTestId("asset-library-browser-detail")).toBeTruthy();
    expect(await screen.findByTestId("asset-item-img1")).toBeTruthy();
  });

  it("selects category then item for preview", async () => {
    wrap();
    await screen.findByTestId("asset-item-img1");
    fireEvent.click(screen.getByTestId("asset-category-c2"));
    expect(await screen.findByTestId("asset-library-empty")).toBeTruthy();
    expect(screen.getByTestId("asset-detail-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("asset-category-c1"));
    fireEvent.click(await screen.findByTestId("asset-item-img1"));
    expect(await screen.findByTestId("asset-detail-preview")).toBeTruthy();
    expect(screen.getByTestId("asset-detail-name")).toHaveValue("Photo");
  });

  it("prompts tab shows library categories and canvas-created mine item", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-prompts"));
    expect(await screen.findByTestId("prompt-libraries-browser")).toBeTruthy();
    expect(await screen.findByTestId("prompt-lib-system")).toBeTruthy();
    expect(await screen.findByTestId("prompt-cat-custom")).toBeTruthy();
    expect(screen.getByTestId("prompt-cat-custom").textContent).toContain("1");

    fireEvent.click(screen.getByTestId("prompt-cat-custom"));
    expect(await screen.findByTestId("prompt-item-tpl_mine_1")).toBeTruthy();
    expect(screen.getByTestId("prompt-item-tpl_mine_1").textContent).toContain("新模板");
    expect(await screen.findByTestId("prompt-detail-positive")).toHaveValue("新提示词");
  });

  it("creates prompt item via shared /api/prompt-libraries and invalidates", async () => {
    vi.mocked(api.post).mockResolvedValue({
      item: {
        id: "tpl_new",
        name: "从素材库",
        positive: "素材库内容",
        category: "custom",
      },
      library: promptLibrariesPayload.library,
    });
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-prompts"));
    await screen.findByTestId("prompt-lib-system");
    await screen.findByTestId("prompt-item-tpl_mine_1");
    const newBtn = await screen.findByTestId("prompt-item-new");
    expect(newBtn).not.toBeDisabled();
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(screen.getByTestId("prompt-edit-name")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("prompt-edit-name"), {
      target: { value: "从素材库" },
    });
    fireEvent.change(screen.getByTestId("prompt-edit-positive"), {
      target: { value: "素材库内容" },
    });
    fireEvent.click(screen.getByTestId("prompt-detail-save"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/prompt-libraries/items",
        expect.objectContaining({
          library_id: "system",
          name: "从素材库",
          positive: "素材库内容",
        }),
      );
    });
  });

  it("workflows tab uses three-column browser", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-workflows"));
    expect(await screen.findByTestId("workflows-browser")).toBeTruthy();
    expect(await screen.findByTestId("workflow-cat-wf1")).toBeTruthy();
    expect(await screen.findByTestId("workflow-item-w1")).toBeTruthy();
    expect(await screen.findByTestId("workflow-drop-zone")).toBeTruthy();
  });

  it("canvas-assets tab uses three-column browser", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-canvas-assets"));
    expect(await screen.findByTestId("canvas-assets-browser")).toBeTruthy();
    expect(await screen.findByTestId("canvas-asset-cat-smart")).toBeTruthy();
    expect(await screen.findByTestId("canvas-asset-item-ca1")).toBeTruthy();
  });

  it("filters via search in middle column", async () => {
    wrap();
    fireEvent.change(await screen.findByTestId("asset-search-input"), {
      target: { value: "Photo" },
    });
    expect(await screen.findByTestId("asset-item-img1")).toBeTruthy();
    fireEvent.change(screen.getByTestId("asset-search-input"), {
      target: { value: "zzzz" },
    });
    expect(await screen.findByTestId("asset-library-empty")).toBeTruthy();
  });

  it("local media tab uses three-column browser with manage mode", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-local-media"));
    expect(await screen.findByTestId("local-media-browser")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("local-media-manage-btn"));
    fireEvent.click(await screen.findByTestId("asset-item-local1"));
    expect(await screen.findByTestId("asset-select-local1")).toBeTruthy();
    expect(await screen.findByTestId("local-detail-preview")).toBeTruthy();
  });

  it("shows upload controls inside images browser", async () => {
    wrap();
    expect(await screen.findByTestId("asset-search-input")).toBeTruthy();
    expect(await screen.findByTestId("asset-category-c1")).toBeTruthy();
    expect(await screen.findByTestId("asset-upload-btn")).toBeTruthy();
    expect(await screen.findByTestId("asset-drop-zone")).toBeTruthy();
  });

  it("shows annotation toolbar in header with vision models", async () => {
    wrap();
    expect(await screen.findByTestId("asset-annotation-toolbar")).toBeTruthy();
    expect(await screen.findByTestId("asset-annotation-provider-trigger")).toBeTruthy();
    expect(await screen.findByTestId("asset-annotation-model-trigger")).toHaveTextContent("gpt-4o");
  });

  it("saves annotation model changes via PATCH", async () => {
    wrap();
    await screen.findByTestId("asset-annotation-toolbar");
    pickStudioOption("asset-annotation-model", "gpt-4o");
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/asset-library/annotation-settings", {
        provider: "openai",
        model: "gpt-4o",
        ms_model: "",
        prompt: "focus style",
      });
    });
  });
});
