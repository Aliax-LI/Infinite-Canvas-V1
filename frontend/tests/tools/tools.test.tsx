import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { UploadZone } from "../../src/shared/components/UploadZone";
import { Lightbox } from "../../src/shared/components/Lightbox";
import { HistoryMasonry } from "../../src/shared/components/HistoryMasonry";
import { CameraStub } from "../../src/features/tools/pages/AnglePage";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UploadZone", () => {
  it("renders drop zone", () => {
    wrap(<UploadZone onFiles={vi.fn()} testId="test-upload" />);
    expect(screen.getByTestId("test-upload")).toBeInTheDocument();
  });
});

describe("Lightbox", () => {
  it("renders image and close button", () => {
    wrap(<Lightbox url="/test.png" onClose={vi.fn()} />);
    expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "/test.png");
    expect(screen.getByTestId("lightbox-close")).toBeInTheDocument();
  });
});

describe("HistoryMasonry", () => {
  it("shows loading state", () => {
    wrap(<HistoryMasonry testId="hist" />);
    expect(screen.getByTestId("hist-loading")).toBeInTheDocument();
  });
});

describe("AnglePage CameraStub", () => {
  it("renders camera preview", () => {
    wrap(<CameraStub rotation={45} pitch={10} distance={20} />);
    expect(screen.getByTestId("angle-camera-stub")).toBeInTheDocument();
  });
});
