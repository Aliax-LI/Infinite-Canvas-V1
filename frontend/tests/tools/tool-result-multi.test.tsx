import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ToolResultStage } from "../../src/features/tools/shared/ToolResultStage";
import { allImageUrls } from "../../src/features/tools/shared/toolClient";
import { HistoryMasonry } from "../../src/shared/components/HistoryMasonry";
import { api } from "../../src/shared/api/client";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(async (path: string) => {
      if (path.startsWith("/api/history")) {
        return [];
      }
      if (path.startsWith("/api/asset-library")) {
        return {
          library: {
            active_library_id: "lib-1",
            categories: [{ id: "generated", type: "image" }],
          },
        };
      }
      if (path.startsWith("/api/canvases")) {
        return { canvases: [] };
      }
      return [];
    }),
    put: vi.fn(),
    post: vi.fn().mockResolvedValue({ canvas: { id: "cv-new", kind: "classic" } }),
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

describe("allImageUrls", () => {
  it("preserves image order from generate result", () => {
    expect(allImageUrls({ images: ["/final.png", "/edge.png"] })).toEqual([
      "/final.png",
      "/edge.png",
    ]);
  });

  it("falls back to url when images empty", () => {
    expect(allImageUrls({ url: "/only.png", images: [] })).toEqual(["/only.png"]);
  });
});

describe("ToolResultStage multi-preview", () => {
  it("renders a single image with legacy resultUrl", () => {
    wrap(<ToolResultStage resultUrl="/a.png" loading={false} testId="stage" />);
    expect(screen.getByTestId("stage-result")).toBeInTheDocument();
    expect(screen.queryByTestId("stage-result-grid")).not.toBeInTheDocument();
    expect(screen.getByTestId("stage-actions-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("stage-actions-download")).toBeInTheDocument();
  });

  it("renders a grid when multiple resultUrls are provided", () => {
    const onPreview = vi.fn();
    wrap(
      <ToolResultStage
        resultUrls={["/final.png", "/edge.png"]}
        loading={false}
        onPreview={onPreview}
        testId="stage"
      />,
    );
    expect(screen.getByTestId("stage-result-grid")).toBeInTheDocument();
    expect(screen.getByTestId("stage-img-0")).toBeInTheDocument();
    expect(screen.getByTestId("stage-img-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stage-img-0"));
    expect(onPreview).toHaveBeenCalledWith("/final.png", {
      urls: ["/final.png", "/edge.png"],
      index: 0,
    });
  });
});

describe("HistoryMasonry multi-preview", () => {
  it("shows multi thumbnails with final-first urls and opens gallery context", async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.startsWith("/api/history")) {
        return [
          {
            timestamp: 42,
            prompt: "control",
            type: "zimage",
            images: ["/final.png", "/edge.png"],
          },
        ];
      }
      if (path.startsWith("/api/asset-library")) {
        return {
          library: {
            active_library_id: "lib-1",
            categories: [{ id: "generated", type: "image" }],
          },
        };
      }
      if (path.startsWith("/api/canvases")) {
        return { canvases: [] };
      }
      return [];
    });
    const onPreview = vi.fn();
    wrap(<HistoryMasonry type="zimage" onPreview={onPreview} testId="hist" />);

    await vi.waitFor(() => {
      expect(screen.getByTestId("history-item-multi-42")).toBeInTheDocument();
    });
    expect(screen.getByText("×2")).toBeInTheDocument();
    const imgs = screen.getByTestId("history-item-multi-42").querySelectorAll("img");
    expect(imgs[0]).toHaveAttribute("src", "/final.png");
    expect(imgs[1]).toHaveAttribute("src", "/edge.png");

    fireEvent.click(screen.getByTestId("history-item-42"));
    expect(onPreview).toHaveBeenCalledWith("/final.png", {
      urls: ["/final.png", "/edge.png"],
      index: 0,
    });
  });
});
