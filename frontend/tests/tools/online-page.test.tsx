import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlinePage } from "../../src/features/tools/pages/OnlinePage";
import { resolveOnlineSize, onlinePreviewSlotMode, onlinePreviewSlotStyle, parseOnlineSizeDimensions } from "../../src/features/tools/pages/onlineSize";
import { HistoryMasonry } from "../../src/shared/components/HistoryMasonry";
import { StudioWorkbenchLayout } from "../../src/shared/components/StudioWorkbenchLayout";
import "../../src/shared/i18n";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  upload: vi.fn(),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());

const pollQueue = vi.hoisted(() => [] as unknown[]);

vi.mock("../../src/shared/api/client", () => ({
  api: apiMock,
  apiFetch: apiFetchMock,
}));

function enqueuePollResponse(value: unknown) {
  pollQueue.push(value);
}

afterEach(() => {
  cleanup();
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** StudioSelect is not a native <select>; pick option via trigger + menu. */
function pickStudioOption(testId: string, value: string) {
  fireEvent.click(screen.getByTestId(`${testId}-trigger`));
  fireEvent.click(screen.getByTestId(`${testId}-option-${value}`));
}

describe("onlineSize", () => {
  it("resolves history-aligned pixel sizes", () => {
    expect(resolveOnlineSize("square", "1k")).toBe("1024x1024");
    expect(resolveOnlineSize("portrait", "1k")).toBe("1024x1536");
    expect(resolveOnlineSize("landscape", "2k")).toBe("2048x1360");
    expect(resolveOnlineSize("story", "1k")).toBe("720x1280");
  });

  it("parses pixel dimensions for preview aspect ratio", () => {
    expect(parseOnlineSizeDimensions("720x1280")).toEqual({ width: 720, height: 1280 });
    expect(onlinePreviewSlotStyle("720x1280", "single")).toMatchObject({
      aspectRatio: "720 / 1280",
      maxHeight: "100%",
      maxWidth: "100%",
      width: "auto",
      height: "auto",
    });
    expect(onlinePreviewSlotStyle("1280x720", "single")).toMatchObject({
      aspectRatio: "1280 / 720",
      maxWidth: "100%",
      maxHeight: "100%",
      width: "auto",
      height: "auto",
    });
    expect(onlinePreviewSlotStyle("1024x1024", "single")).toMatchObject({
      aspectRatio: "1024 / 1024",
      maxWidth: "100%",
      maxHeight: "100%",
      width: "auto",
      height: "auto",
    });
    expect(onlinePreviewSlotStyle("1024x1024", "grid-fit")).toMatchObject({
      aspectRatio: "1024 / 1024",
      height: "100%",
      width: "auto",
      maxWidth: "100%",
      maxHeight: "100%",
    });
    expect(onlinePreviewSlotStyle("1024x1024", "single", { loading: true })).toMatchObject({
      aspectRatio: "1024 / 1024",
      height: "100%",
      width: "auto",
      maxWidth: "100%",
      maxHeight: "100%",
    });
    expect(onlinePreviewSlotMode(1)).toBe("single");
    expect(onlinePreviewSlotMode(4)).toBe("grid-fit");
  });
});

describe("StudioWorkbenchLayout", () => {
  it("renders full-bleed grid with sidebar, main, and footer slots", () => {
    wrap(
      <StudioWorkbenchLayout
        title="Workbench"
        backTo="/canvases"
        sidebar={<div data-testid="slot-sidebar">sidebar</div>}
        main={<div data-testid="slot-main">main</div>}
        footer={<div data-testid="slot-footer">footer</div>}
        testId="wb"
      />,
    );
    expect(screen.getByTestId("wb")).toHaveClass("studio-workbench-shell");
    expect(screen.getByTestId("wb-grid")).toBeInTheDocument();
    expect(screen.getByTestId("slot-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("slot-main")).toBeInTheDocument();
    expect(screen.getByTestId("slot-footer")).toBeInTheDocument();
    expect(screen.getByTestId("wb-back")).toBeInTheDocument();
  });
});

describe("OnlinePage", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.upload.mockReset();
    apiFetchMock.mockReset();
    pollQueue.length = 0;
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith("/api/canvas-image-tasks/")) {
        const next = pollQueue.shift();
        if (next instanceof Promise) return next;
        if (next !== undefined) return Promise.resolve(next);
        return Promise.resolve({ status: "running" });
      }
      if (path.startsWith("/api/history")) return Promise.resolve([]);
      if (path === "/api/config") {
        return Promise.resolve({
          image_model: "gpt-image-2",
          image_models: ["gpt-image-2"],
          api_providers: [
            {
              id: "comfly",
              name: "Comfly",
              protocol: "api",
              enabled: true,
              primary: true,
              image_models: ["gpt-image-2", "nano-banana-pro"],
            },
          ],
        });
      }
      return Promise.resolve({});
    });
  });

  it("uses StudioSelect for platform/model/count controls", async () => {
    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    expect(screen.getByTestId("online-provider")).toHaveClass("studio-select");
    expect(screen.getByTestId("online-model")).toHaveClass("studio-select");
    expect(screen.getByTestId("online-resolution")).toHaveClass("studio-select");
    expect(screen.getByTestId("online-size")).toHaveClass("studio-select");
    expect(screen.getByTestId("online-quality")).toHaveClass("studio-select");
    expect(screen.getByTestId("online-count")).toHaveClass("studio-select");
  });

  it("uses adaptive workbench layout (not max-w centered column)", async () => {
    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-workbench")).toBeInTheDocument();
    });

    expect(screen.getByTestId("online-workbench")).toHaveClass("studio-workbench-shell");
    expect(screen.getByTestId("online-workbench-grid")).toHaveClass("studio-workbench-layout--sidebar-height");
    expect(screen.getByTestId("online-workbench-main")).toBeInTheDocument();
    expect(screen.queryByTestId("online-page")?.querySelector(".max-w-7xl")).toBeNull();
  });

  it("renders shared archive masonry with delete controls in footer", async () => {
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith("/api/history")) {
        return Promise.resolve([
          { timestamp: 77, prompt: "test", type: "online", images: ["/assets/output/x.png"] },
        ]);
      }
      if (path === "/api/config") {
        return Promise.resolve({
          image_model: "gpt-image-2",
          image_models: ["gpt-image-2"],
          api_providers: [
            {
              id: "comfly",
              name: "Comfly",
              protocol: "api",
              enabled: true,
              primary: true,
              image_models: ["gpt-image-2"],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-history")).toBeInTheDocument();
      expect(screen.getByTestId("online-history-grid")).toHaveClass("studio-history-masonry");
      expect(screen.getByTestId("online-history-select-mode")).toBeInTheDocument();
      expect(screen.getByTestId("history-delete-77")).toBeInTheDocument();
    });
  });

  it("submits via canvas-image-tasks then polls like history", async () => {
    apiFetchMock.mockResolvedValueOnce({
      task_id: "canvas_img_online",
      status: "queued",
    });
    enqueuePollResponse({
      status: "succeeded",
      result: { images: ["/assets/output/online_ok.png"] },
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "一只猫" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/canvas-image-tasks",
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(
        String(apiFetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
      );
      expect(body).toEqual(
        expect.objectContaining({
          prompt: "一只猫",
          provider_id: "comfly",
          model: "gpt-image-2",
          size: "1024x1024",
          n: 1,
          quality: "auto",
          reference_images: [],
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("online-result-img-0").querySelector("img")).toHaveAttribute(
        "src",
        "/assets/output/online_ok.png",
      );
    });
  });

  it("shows friendly error when async task fails", async () => {
    apiFetchMock.mockResolvedValueOnce({
      task_id: "canvas_img_fail",
      status: "queued",
    });
    enqueuePollResponse({
      status: "failed",
      error: "请求上游生图接口失败：Server disconnected without sending a response.",
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "一只猫" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("online-error")).toHaveTextContent("断开连接");
    });
  });

  it("shows square skeleton with shimmer while generating one image", async () => {
    let resolvePoll!: (value: unknown) => void;
    apiFetchMock.mockResolvedValueOnce({ task_id: "canvas_img_sq", status: "queued" });
    enqueuePollResponse(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "一只猫" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      const skeleton = screen.getByTestId("online-skeleton-0");
      expect(screen.getByTestId("online-skeleton-grid")).toHaveClass("studio-online-result-grid--single");
      expect(skeleton).toHaveClass("studio-online-preview-slot--loading");
      expect(skeleton.querySelector(".studio-online-skeleton-shimmer")).toBeTruthy();
      expect(skeleton.querySelector(".studio-online-skeleton-spinner")).toBeTruthy();
      expect(skeleton).toHaveStyle({ height: "100%" });
      expect(skeleton).toHaveStyle({ aspectRatio: "1024 / 1024" });
    });

    resolvePoll({
      status: "succeeded",
      result: { images: ["/assets/output/square.png"] },
    });

    await waitFor(() => {
      expect(screen.queryByTestId("online-skeleton-0")).not.toBeInTheDocument();
      expect(screen.getByTestId("online-result-img-0")).toBeInTheDocument();
    });
  });

  it("shows portrait 9:16 skeleton aspect ratio while generating", async () => {
    let resolvePoll!: (value: unknown) => void;
    apiFetchMock.mockResolvedValueOnce({ task_id: "canvas_img_story", status: "queued" });
    enqueuePollResponse(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    pickStudioOption("online-size", "story");
    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "竖屏猫" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      const skeleton = screen.getByTestId("online-skeleton-0");
      expect(skeleton).toHaveClass("studio-online-preview-slot--loading");
      expect(skeleton.querySelector(".studio-online-skeleton-shimmer")).toBeTruthy();
      expect(skeleton.querySelector(".studio-online-skeleton-spinner")).toBeTruthy();
      expect(screen.getByTestId("online-page-result")).toHaveClass("studio-workbench-stage--loading");
      expect(skeleton).toHaveStyle({ aspectRatio: "720 / 1280" });
      expect(skeleton).toHaveStyle({ maxHeight: "100%" });
      expect(skeleton).toHaveStyle({ width: "auto" });
      expect(skeleton).toHaveStyle({ height: "100%" });
    });

    resolvePoll({
      status: "succeeded",
      result: { images: ["/assets/output/story.png"] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("online-result-img-0")).toHaveStyle({ aspectRatio: "720 / 1280" });
    });
  });

  it("sends n=4 and shows 4 skeletons then all returned images", async () => {
    const images = [
      "/assets/output/a.png",
      "/assets/output/b.png",
      "/assets/output/c.png",
      "/assets/output/d.png",
    ];
    let resolvePoll!: (value: unknown) => void;
    apiFetchMock.mockResolvedValueOnce({ task_id: "canvas_img_quad", status: "queued" });
    enqueuePollResponse(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    pickStudioOption("online-count", "4");
    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "四只猫" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      const grid = screen.getByTestId("online-skeleton-grid");
      expect(grid).toHaveClass("studio-online-result-grid--bounded");
      expect(grid).toHaveClass("studio-online-result-grid--quad");
      expect(screen.getByTestId("online-skeleton-0")).toBeInTheDocument();
      expect(screen.getByTestId("online-skeleton-1")).toBeInTheDocument();
      expect(screen.getByTestId("online-skeleton-2")).toBeInTheDocument();
      expect(screen.getByTestId("online-skeleton-3")).toBeInTheDocument();
      expect(screen.queryByTestId("online-skeleton-4")).not.toBeInTheDocument();
      expect(screen.getByTestId("online-skeleton-0")).toHaveStyle({ height: "100%" });
      expect(screen.getByTestId("online-skeleton-0")).toHaveStyle({ width: "auto" });
    });

    resolvePoll({
      status: "succeeded",
      result: { images },
    });

    await waitFor(() => {
      const body = JSON.parse(
        String(apiFetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
      );
      expect(body).toEqual(
        expect.objectContaining({ n: 4, prompt: "四只猫" }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId("online-skeleton-grid")).not.toBeInTheDocument();
      expect(screen.getByTestId("online-result-grid")).toHaveClass("studio-online-result-grid--bounded");
      expect(screen.getByTestId("online-result-img-0")).toHaveStyle({ height: "100%" });
      images.forEach((src, idx) => {
        expect(screen.getByTestId(`online-result-img-${idx}`).querySelector("img")).toHaveAttribute(
          "src",
          src,
        );
      });
    });
  });

  it("opens lightbox with prev/next for multi-image results", async () => {
    const images = ["/assets/output/a.png", "/assets/output/b.png", "/assets/output/c.png"];
    apiFetchMock.mockResolvedValueOnce({ task_id: "canvas_img_multi", status: "queued" });
    enqueuePollResponse({
      status: "succeeded",
      result: { images },
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-provider-trigger").textContent).toContain("Comfly");
    });

    pickStudioOption("online-count", "3");
    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "三只猫" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("online-result-img-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("online-result-img-1"));

    await waitFor(() => {
      expect(screen.getByTestId("lightbox")).toBeInTheDocument();
      expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", images[1]);
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("2 / 3");
      expect(screen.getByTestId("lightbox-download")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("lightbox-next"));
    expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", images[2]);
    expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("3 / 3");

    fireEvent.click(screen.getByTestId("lightbox-prev"));
    fireEvent.click(screen.getByTestId("lightbox-prev"));
    expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", images[0]);
    expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", images[1]);
  });

  it("places reference upload near the top of the form column", async () => {
    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-upload")).toBeInTheDocument();
    });

    const page = screen.getByTestId("online-page");
    const upload = screen.getByTestId("online-upload");
    const prompt = screen.getByTestId("online-page-prompt");
    const result = screen.getByTestId("online-page-result");
    const refsGrid = screen.getByTestId("online-refs");

    expect(upload).toHaveClass("studio-tool-ref-slot");
    expect(refsGrid).toContainElement(upload);
    expect(page.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(upload.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(page.contains(result)).toBe(true);
  });

  it("uses square reference slot containers", async () => {
    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-upload")).toBeInTheDocument();
    });

    const uploadSlot = screen.getByTestId("online-upload");
    expect(uploadSlot).toHaveClass("studio-tool-ref-slot");
    expect(screen.getByTestId("online-ref-slot-2")).toHaveClass("studio-tool-ref-slot");
    expect(screen.getByTestId("online-ref-slot-3")).toHaveClass("studio-tool-ref-slot");
  });

  it("shows optimistic ref preview then server url after upload", async () => {
    let resolveUpload!: (value: unknown) => void;
    apiMock.upload.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-upload")).toBeInTheDocument();
    });

    const file = new File(["pixels"], "ref.png", { type: "image/png" });
    const zone = screen.getByTestId("online-upload");
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [file],
        types: ["Files"],
        getData: () => "",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("online-ref-thumb")).toBeInTheDocument();
      expect(screen.getByTestId("online-ref-uploading")).toBeInTheDocument();
      expect(screen.getByTestId("online-ref-thumb")).toHaveAttribute("src", "blob:vitest-preview");
    });

    resolveUpload({ files: [{ url: "/assets/input/ref_uploaded.png", name: "ref.png" }] });

    await waitFor(() => {
      expect(screen.queryByTestId("online-ref-uploading")).not.toBeInTheDocument();
      expect(screen.getByTestId("online-ref-thumb")).toHaveAttribute(
        "src",
        "/assets/input/ref_uploaded.png",
      );
    });
  });

  it("submits uploaded reference_images in generate request", async () => {
    apiMock.upload.mockResolvedValue({
      files: [{ url: "/assets/input/ref_edit.png", name: "ref_edit.png" }],
    });
    apiFetchMock.mockResolvedValueOnce({ task_id: "canvas_img_ref", status: "queued" });
    enqueuePollResponse({
      status: "succeeded",
      result: { images: ["/assets/output/online_ok.png"] },
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-upload")).toBeInTheDocument();
    });

    const file = new File(["pixels"], "ref_edit.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("online-upload"), {
      dataTransfer: {
        files: [file],
        types: ["Files"],
        getData: () => "",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("online-ref-thumb")).toHaveAttribute(
        "src",
        "/assets/input/ref_edit.png",
      );
      expect(screen.queryByTestId("online-ref-uploading")).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("online-page-prompt"), {
      target: { value: "编辑这张图" },
    });
    fireEvent.click(screen.getByTestId("online-page-submit"));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
      const body = JSON.parse(
        String(apiFetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
      );
      expect(body).toEqual(
        expect.objectContaining({
          prompt: "编辑这张图",
          reference_images: [
            expect.objectContaining({
              url: "/assets/input/ref_edit.png",
              name: "ref_edit.png",
            }),
          ],
        }),
      );
    });
  });

  it("adds archive image as reference from history card action", async () => {
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith("/api/history")) {
        return Promise.resolve([
          {
            timestamp: 42,
            prompt: "蓝色天空",
            images: ["/assets/output/archive.png"],
            type: "online",
          },
        ]);
      }
      if (path === "/api/config") {
        return Promise.resolve({
          image_model: "gpt-image-2",
          image_models: ["gpt-image-2"],
          api_providers: [
            {
              id: "comfly",
              name: "Comfly",
              protocol: "api",
              enabled: true,
              primary: true,
              image_models: ["gpt-image-2"],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-add-ref-42")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("history-add-ref-42"));

    await waitFor(() => {
      expect(screen.getByTestId("online-ref-thumb")).toHaveAttribute(
        "src",
        "/assets/output/archive.png",
      );
      expect(screen.getByTestId("online-ref-count")).toHaveTextContent("1/3");
    });
  });

  it("opens lightbox when clicking a reference thumbnail", async () => {
    apiMock.upload.mockResolvedValue({
      files: [{ url: "/assets/input/ref_preview.png", name: "ref_preview.png" }],
    });

    wrap(<OnlinePage />);

    await waitFor(() => {
      expect(screen.getByTestId("online-upload")).toBeInTheDocument();
    });

    const file = new File(["pixels"], "ref_preview.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("online-upload"), {
      dataTransfer: {
        files: [file],
        types: ["Files"],
        getData: () => "",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("online-ref-thumb")).toHaveAttribute(
        "src",
        "/assets/input/ref_preview.png",
      );
    });

    fireEvent.click(screen.getByTestId("online-ref-open"));

    await waitFor(() => {
      expect(screen.getByTestId("lightbox")).toBeInTheDocument();
      expect(screen.getByTestId("lightbox-image")).toHaveAttribute(
        "src",
        "/assets/input/ref_preview.png",
      );
    });
  });
});

describe("HistoryMasonry broken assets", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockResolvedValue([
      {
        timestamp: 99,
        prompt: "改成蓝色",
        images: ["/assets/output/missing.png"],
        type: "online",
      },
    ]);
  });

  it("shows missing placeholder when thumbnail fails to load", async () => {
    wrap(<HistoryMasonry type="online" testId="online-history" />);

    await waitFor(() => {
      expect(screen.getByTestId("history-item-99")).toBeInTheDocument();
    });

    const img = screen.getByTestId("history-item-99").querySelector("img");
    expect(img).toBeTruthy();
    fireEvent.error(img!);

    await waitFor(() => {
      expect(screen.getByTestId("history-item-missing-99")).toBeInTheDocument();
    });
  });
});
