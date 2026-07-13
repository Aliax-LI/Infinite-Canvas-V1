import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImageEditModal } from "../../src/features/canvas/components/ImageEditModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

vi.mock("../../src/features/canvas/core/uploadMedia", () => ({
  canvasDisplayMediaUrl: (url: string) => url,
  uploadCanvasMediaFiles: vi.fn(async () => [{ url: "/assets/result.png", name: "result.png" }]),
}));

vi.mock("../../src/features/canvas/core/imageEdit", async () => {
  const actual = await vi.importActual<typeof import("../../src/features/canvas/core/imageEdit")>(
    "../../src/features/canvas/core/imageEdit",
  );
  return {
    ...actual,
    cropImageToBlob: vi.fn(async () => new Blob(["crop"], { type: "image/png" })),
    outpaintImageToBlob: vi.fn(async () => new Blob(["out"], { type: "image/png" })),
    drawCanvasHasPixels: vi.fn(() => true),
    maskCanvasFromDraw: vi.fn(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 10;
      canvas.height = 10;
      canvas.toBlob = (cb: BlobCallback) => cb(new Blob(["mask"], { type: "image/png" }));
      return canvas;
    }),
  };
});

afterEach(() => {
  cleanup();
});

function loadDemoImage() {
  const img = screen.getByTestId("legacy-edit-image") as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { value: 800, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: 1000, configurable: true });
  fireEvent.load(img);
  return img;
}

describe("ImageEditModal", () => {
  it("renders large stage with zoom controls in preview", () => {
    render(
      <ImageEditModal
        open
        url="/assets/demo.png"
        title="Output_crop.png"
        nodeId="n1"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("legacy-image-edit-modal")).toBeTruthy();
    const stage = screen.getByTestId("legacy-image-edit-stage");
    expect(stage).toBeTruthy();
    expect(stage.className).toContain("studio-transparency-board");
    expect(screen.getByTestId("legacy-image-zoom-label").textContent).toContain("100%");
    expect(screen.getByTestId("legacy-image-zoom-in")).toBeTruthy();
    expect(screen.getByTestId("legacy-image-zoom-out")).toBeTruthy();
  });

  it("shows movable crop overlay with handles", () => {
    render(
      <ImageEditModal
        open
        url="/assets/demo.png"
        title="Output_crop.png"
        nodeId="n1"
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId("legacy-image-edit-tab-crop"));
    loadDemoImage();

    const overlay = screen.getByTestId("legacy-crop-overlay");
    expect(overlay.className).toContain("legacy-crop-box");
    expect(screen.getByTestId("legacy-crop-handle-se")).toBeTruthy();
    expect(screen.getByTestId("legacy-crop-handle-nw")).toBeTruthy();
  });

  it("outpaint mode exposes frame handles", () => {
    render(
      <ImageEditModal
        open
        url="/assets/demo.png"
        title="Output_crop.png"
        nodeId="n1"
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId("legacy-image-edit-tab-outpaint"));
    loadDemoImage();

    expect(screen.getByTestId("legacy-outpaint-canvas")).toBeTruthy();
    expect(screen.getByTestId("legacy-outpaint-handle-se")).toBeTruthy();
  });

  it("mask mode uses brush canvas without crop overlay", () => {
    render(
      <ImageEditModal
        open
        url="/assets/demo.png"
        title="Output_crop.png"
        nodeId="n1"
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId("legacy-image-edit-tab-mask"));
    loadDemoImage();
    expect(screen.getByTestId("legacy-mask-canvas")).toBeTruthy();
    expect(screen.queryByTestId("legacy-crop-overlay")).toBeNull();
    const slider = screen.getByTestId("legacy-mask-brush-slider") as HTMLInputElement;
    expect(slider.value).toBe("42");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(slider.value).toBe("80");
    expect(screen.getByTestId("legacy-mask-brush-size-value").textContent).toBe("80");
  });

  it("emits onResultCreated after apply crop", async () => {
    const onResultCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <ImageEditModal
        open
        url="/assets/demo.png"
        title="photo"
        nodeId="n1"
        onClose={onClose}
        onResultCreated={onResultCreated}
      />,
    );
    fireEvent.click(screen.getByTestId("legacy-image-edit-tab-crop"));
    loadDemoImage();
    fireEvent.click(screen.getByTestId("legacy-apply-crop"));
    await vi.waitFor(() => {
      expect(onResultCreated).toHaveBeenCalledWith(
        "n1",
        expect.objectContaining({ kind: "crop", url: "/assets/result.png" }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("opens create-import menu on preview stage right-click", () => {
    const onCreateImportNode = vi.fn();
    render(
      <ImageEditModal
        open
        url="/assets/demo.png"
        title="photo"
        nodeId="n1"
        onClose={() => undefined}
        onCreateImportNode={onCreateImportNode}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("legacy-image-edit-stage"), {
      clientX: 200,
      clientY: 100,
    });
    expect(screen.getByTestId("legacy-image-context-menu")).toBeTruthy();
    fireEvent.click(screen.getByTestId("legacy-image-menu-create-import"));
    expect(onCreateImportNode).toHaveBeenCalledWith(
      "n1",
      "/assets/demo.png",
      "photo",
    );
  });
});
