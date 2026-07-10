import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssetManagerPage } from "../../src/features/asset-manager/AssetManagerPage";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

import { api } from "../../src/shared/api/client";

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
            libraries: [
              {
                id: "lib1",
                categories: [
                  { id: "c1", type: "image", items: [{ id: "img1", name: "Photo" }] },
                  { id: "c2", type: "workflow", items: [{ id: "wf1", name: "Flow" }] },
                ],
              },
            ],
          },
        });
      }
      if (path === "/api/local-assets") {
        return Promise.resolve({ items: [{ id: "local1", name: "Local", url: "/x.png" }] });
      }
      if (path === "/api/prompt-libraries") {
        return Promise.resolve({ libraries: [{ id: "pl1", name: "Default" }] });
      }
      if (path === "/api/canvas-assets") {
        return Promise.resolve({ items: [{ id: "ca1", name: "Canvas Asset" }] });
      }
      return Promise.resolve({});
    });
  });

  it("renders 5 tabs", () => {
    wrap();
    expect(screen.getByTestId("asset-manager-page")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-images")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-workflows")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-prompts")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-canvas-assets")).toBeTruthy();
    expect(screen.getByTestId("asset-tab-local-media")).toBeTruthy();
  });

  it("shows images tab by default", async () => {
    wrap();
    expect(await screen.findByTestId("asset-tab-panel-images")).toBeTruthy();
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
    expect(await screen.findByTestId("image-img1")).toBeTruthy();
  });

  it("multi-select on local media tab", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-local-media"));
    const checkbox = await screen.findByTestId("local-media-select-local1");
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("canvas-assets tab loads items", async () => {
    wrap();
    fireEvent.click(screen.getByTestId("asset-tab-canvas-assets"));
    expect(await screen.findByTestId("canvas-asset-ca1")).toBeTruthy();
  });
});
