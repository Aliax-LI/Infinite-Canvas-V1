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
                categories: [
                  {
                    id: "c1",
                    type: "image",
                    name: "角色",
                    items: [{ id: "img1", name: "Photo", url: "/assets/library/test.png" }],
                  },
                  { id: "c2", type: "workflow", items: [{ id: "wf1", name: "Flow" }] },
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
        return Promise.resolve({ libraries: [{ id: "pl1", name: "Default" }] });
      }
      if (path === "/api/canvas-assets") {
        return Promise.resolve({ items: [{ id: "ca1", name: "Canvas Asset", url: "/x.png" }] });
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
  });
  it("renders 5 tabs", () => {
    wrap();
    expect(screen.getByTestId("asset-manager-page")).toBeTruthy();
    expect(screen.getByTestId("asset-manager-page").className).toContain("studio-asset-shell");
    expect(screen.getByTestId("asset-tab-images")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-images").className).toContain("active");
    expect(screen.getByTestId("asset-tab-workflows")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-prompts")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-canvas-assets")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-local-media")).toBeTruthy();
  });

  it("shows images tab with masonry by default", async () => {
    wrap();
    expect(await screen.findByTestId("asset-tab-panel-images")).toBeTruthy();
    expect(await screen.findByTestId("asset-library-masonry")).toBeTruthy();
    expect(await screen.findByTestId("asset-item-img1")).toBeTruthy();
  });

  it("switches to prompts tab", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-prompts"));
    expect(await screen.findByTestId("asset-tab-panel-prompts")).toBeTruthy();
    expect(await screen.findByTestId("prompt-lib-pl1")).toBeTruthy();
  });

  it("filters via search", async () => {
    wrap();
    fireEvent.change(screen.getByTestId("asset-search-input"), {
      target: { value: "Photo" },
    });
    expect(await screen.findByTestId("asset-item-img1")).toBeTruthy();
  });

  it("multi-select mode on local media tab", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-local-media"));
    await waitFor(() => screen.getByTestId("local-media-masonry-select-mode"));
    fireEvent.click(screen.getByTestId("local-media-masonry-select-mode"));
    fireEvent.click(await screen.findByTestId("asset-item-local1"));
    expect(await screen.findByTestId("asset-select-local1")).toBeTruthy();
  });

  it("canvas-assets tab loads masonry", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-canvas-assets"));
    expect(await screen.findByTestId("canvas-assets-masonry")).toBeTruthy();
    expect(await screen.findByTestId("asset-item-ca1")).toBeTruthy();
  });

  it("shows unified toolbar with search and category chips on images tab", async () => {
    wrap();
    expect(await screen.findByTestId("asset-search-input")).toBeTruthy();
    expect(await screen.findByTestId("asset-category-all")).toBeTruthy();
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