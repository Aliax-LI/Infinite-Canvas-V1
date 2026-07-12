import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMasonry } from "../../src/shared/components/AssetMasonry";
import { api } from "../../src/shared/api/client";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const sampleItems = [
  {
    id: "img1",
    name: "Photo",
    url: "/assets/library/test.png",
    tags: ["产品"],
  },
];

describe("AssetMasonry tagging", () => {
  beforeEach(() => {
    vi.mocked(api.patch).mockResolvedValue({ item: { id: "img1", tags: ["产品", "室内"] } });
    vi.mocked(api.post).mockResolvedValue({ item: { id: "img1", tags: ["产品", "AI"] } });
  });

  it("shows tag chips and annotate action", async () => {
    wrap(
      <AssetMasonry
        items={sampleItems}
        libraryId="default"
        enableTagging
        testId="asset-tags"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("asset-tags-img1")).toBeInTheDocument();
      expect(screen.getByTestId("asset-annotate-img1")).toBeInTheDocument();
    });
  });

  it("calls annotate API from card action", async () => {
    wrap(
      <AssetMasonry
        items={sampleItems}
        libraryId="default"
        enableTagging
        testId="asset-tags"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("asset-annotate-img1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("asset-annotate-img1"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/asset-library/items/img1/annotate", {
        library_id: "default",
      });
    });
  });
});
