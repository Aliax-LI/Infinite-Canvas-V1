import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UpdateBadge, UpdateModal } from "../../src/features/update/UpdateUI";

vi.mock("../../src/features/update/hooks", () => ({
  useCheckUpdate: vi.fn(),
}));

import { useCheckUpdate } from "../../src/features/update/hooks";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("UpdateUI", () => {
  afterEach(() => cleanup());

  it("shows update badge when backend reports update_available", () => {
    vi.mocked(useCheckUpdate).mockReturnValue({
      data: {
        current: "2026.07.6",
        latestVersion: "2026.07.8",
        updateAvailable: true,
        releaseUrl: "https://github.com/example/releases/tag/v2026.07.8",
        releaseNotes: "- fixes",
        reachable: true,
      },
    } as ReturnType<typeof useCheckUpdate>);

    wrap(<UpdateBadge />);
    expect(screen.getByTestId("update-badge")).toBeTruthy();
  });

  it("hides update badge when no update is available", () => {
    vi.mocked(useCheckUpdate).mockReturnValue({
      data: {
        current: "2026.07.8",
        latestVersion: "2026.07.8",
        updateAvailable: false,
        reachable: true,
      },
    } as ReturnType<typeof useCheckUpdate>);

    wrap(<UpdateBadge />);
    expect(screen.queryByTestId("update-badge")).toBeNull();
  });

  it("renders modal with release url and notes from nested latest", () => {
    vi.mocked(useCheckUpdate).mockReturnValue({
      data: {
        current: "2026.07.6",
        latestVersion: "2026.07.8",
        updateAvailable: true,
        releaseUrl: "https://github.com/example/releases/tag/v2026.07.8",
        releaseNotes: "- parity fix",
        reachable: true,
      },
    } as ReturnType<typeof useCheckUpdate>);

    wrap(<UpdateModal open onClose={() => undefined} />);
    expect(screen.getByTestId("update-modal")).toBeTruthy();
    expect(screen.getByText(/最新版本：2026\.07\.8/)).toBeTruthy();
    expect(screen.getByText("- parity fix")).toBeTruthy();
    const download = screen.getByRole("link", { name: "下载" });
    expect(download.getAttribute("href")).toBe(
      "https://github.com/example/releases/tag/v2026.07.8",
    );
  });
});
