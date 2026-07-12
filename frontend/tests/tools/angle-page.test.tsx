import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnglePage } from "../../src/features/tools/pages/AnglePage";
import { CameraPreview } from "../../src/features/tools/shared/CameraPreview";
import "../../src/shared/i18n";

const toolClientMock = vi.hoisted(() => ({
  uploadToComfy: vi.fn(),
  comfyGenerate: vi.fn(),
  angleGenerate: vi.fn(),
  anglePollStatus: vi.fn(),
  fetchModelScopeToken: vi.fn(),
  fileToDataUri: vi.fn(),
  firstImageUrl: vi.fn(),
}));

vi.mock("../../src/features/tools/shared/toolClient", () => toolClientMock);

vi.mock("../../src/shared/components/HistoryMasonry", () => ({
  HistoryMasonry: () => <div data-testid="angle-history" />,
}));

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../src/shared/api/client", () => ({
  api: apiMock,
}));

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

describe("CameraPreview", () => {
  it("shows placeholder without image", () => {
    render(
      <CameraPreview imageUrl={null} rotation={0} pitch={0} distance={4} />,
    );
    expect(screen.getByTestId("angle-camera-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("angle-camera-image")).not.toBeInTheDocument();
  });

  it("renders image with transform from sliders", () => {
    render(
      <CameraPreview imageUrl="/assets/input/ref.png" rotation={45} pitch={-10} distance={2} />,
    );
    const image = screen.getByTestId("angle-camera-image");
    expect(image).toHaveAttribute("src", "/assets/input/ref.png");
    expect(image).toHaveStyle({
      transform: "rotateY(45deg) rotateX(-10deg) scale(2) translateZ(20px)",
    });
  });
});

describe("AnglePage", () => {
  beforeEach(() => {
    toolClientMock.uploadToComfy.mockResolvedValue([{ comfy_name: "input.png" }]);
    apiMock.get.mockResolvedValue({ items: [] });
  });

  it("uses square input source container", async () => {
    wrap(<AnglePage />);
    expect(screen.getByTestId("angle-upload")).toHaveClass("studio-tool-ref-slot");
  });

  it("shows live camera preview after upload and updates on slider change", async () => {
    wrap(<AnglePage />);

    const file = new File(["pixels"], "ref.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("angle-upload"), {
      dataTransfer: {
        files: [file],
        types: ["Files"],
        getData: () => "",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("angle-input-thumb")).toBeInTheDocument();
      expect(screen.getByTestId("angle-camera-image")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("angle-rotation"), { target: { value: "30" } });
    expect(screen.getByTestId("angle-camera-image")).toHaveStyle({
      transform: "rotateY(30deg) rotateX(0deg) scale(1) translateZ(0px)",
    });
  });

  it("keeps angle command text in sync with sliders", async () => {
    wrap(<AnglePage />);

    fireEvent.change(screen.getByTestId("angle-rotation"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("angle-pitch"), { target: { value: "-10" } });

    await waitFor(() => {
      expect(screen.getByTestId("angle-command")).toHaveTextContent("将相机向右旋转20度，仰视10度");
      expect(screen.getByTestId("angle-prompt")).toHaveValue("将相机向右旋转20度，仰视10度");
    });
  });
});
