import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryMasonry } from "../../src/shared/components/HistoryMasonry";
import { api } from "../../src/shared/api/client";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    upload: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const sampleItems = [
  { timestamp: 10, prompt: "a", type: "online", images: ["/a.png"] },
  { timestamp: 20, prompt: "b", type: "online", images: ["/b.png"] },
];

describe("HistoryMasonry delete and selection", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/asset-library") {
        return Promise.resolve({
          library: {
            active_library_id: "default",
            categories: [
              { id: "generated", name: "生成结果", type: "image", items: [] },
            ],
          },
        });
      }
      return Promise.resolve(sampleItems);
    });
    vi.mocked(api.post).mockResolvedValue({ success: true, deleted: 1 });
  });

  it("uses adaptive masonry column layout", async () => {
    wrap(<HistoryMasonry type="online" testId="online-history" />);
    await waitFor(() => {
      expect(screen.getByTestId("online-history-grid")).toHaveClass("studio-history-masonry");
    });
  });

  it("deletes a single archive after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    wrap(<HistoryMasonry type="online" testId="online-history" />);

    await waitFor(() => {
      expect(screen.getByTestId("history-delete-10")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("history-delete-10"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/history/delete", { timestamp: 10 });
    });
  });

  it("supports multi-select batch delete", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({ success: true, deleted: 2 });
    wrap(<HistoryMasonry type="online" testId="online-history" />);

    await waitFor(() => {
      expect(screen.getByTestId("online-history-select-mode")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("online-history-select-mode"));
    fireEvent.click(screen.getByTestId("history-item-10"));
    fireEvent.click(screen.getByTestId("history-item-20"));
    fireEvent.click(screen.getByTestId("online-history-delete-selected"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/history/delete-batch", {
        timestamps: [10, 20],
      });
    });
  });

  it("adds archive images to asset library", async () => {
    vi.mocked(api.post).mockImplementation((path: string, body?: unknown) => {
      if (path === "/api/asset-library/items/batch") {
        return Promise.resolve({ items: [{ id: "asset_1" }] });
      }
      return Promise.resolve({ success: true, deleted: 1 });
    });

    wrap(<HistoryMasonry type="online" testId="online-history" />);

    await waitFor(() => {
      expect(screen.getByTestId("history-add-library-10")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("history-add-library-10"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/asset-library/items/batch", {
        category_id: "generated",
        library_id: "default",
        items: [{ url: "/a.png", name: "a" }],
      });
      expect(screen.getByTestId("online-history-status")).toHaveTextContent(/素材库/);
    });
  });
});
