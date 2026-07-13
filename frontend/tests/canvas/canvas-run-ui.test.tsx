import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PendingOutputCard, NodeRunningBadge } from "../../src/features/canvas/components/CanvasRunUi";
import { GeneratorNodeBody } from "../../src/features/canvas/components/GeneratorNodeBody";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

vi.mock("../../src/shared/api/client", () => ({
  api: { get: vi.fn().mockResolvedValue({ api_providers: [] }), post: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CanvasRunUi pending / running", () => {
  it("renders soft pending card with spinner (not error red)", () => {
    render(
      <PendingOutputCard
        pending={{ id: "p1", startedAt: Date.now() - 2500 }}
        width={280}
      />,
    );
    const card = screen.getByTestId("output-pending-p1");
    expect(card.getAttribute("data-pending-failed")).toBe("0");
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.className).toContain("studio-canvas-pending-slot");
    expect(card.className).not.toContain("legacy-output-error-row");
  });

  it("renders failed pending with red error style", () => {
    render(
      <PendingOutputCard
        pending={{
          id: "p2",
          startedAt: Date.now(),
          failed: true,
          error: "boom",
        }}
        width={280}
      />,
    );
    const card = screen.getByTestId("output-pending-p2");
    expect(card.getAttribute("data-pending-failed")).toBe("1");
    expect(card.className).toContain("legacy-output-error-row");
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows running badge", () => {
    render(<NodeRunningBadge elapsed="3s" />);
    expect(screen.getByTestId("node-running-badge")).toBeInTheDocument();
    expect(screen.getByTestId("node-running-badge").textContent).toMatch(/3s/);
  });

  it("generator run button shows spinner + elapsed while running", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <GeneratorNodeBody
          node={createLegacyNode({
            id: "g1",
            kind: "generator",
            settings: {
              apiProvider: "x",
              model: "m",
              runStartedAt: Date.now() - 4000,
            },
          })}
          running
          onUpdateSettings={() => {}}
          onUpdatePrompt={() => {}}
          onRun={() => {}}
        />
      </QueryClientProvider>,
    );
    const btn = screen.getByTestId("legacy-gen-run-g1");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toMatch(/generating/i);
    expect(btn.className).toContain("ring-blue");
  });

  it("shows near-zero elapsed when a new run just started", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const now = 1_700_000_200_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(
      <QueryClientProvider client={client}>
        <GeneratorNodeBody
          node={createLegacyNode({
            id: "g2",
            kind: "generator",
            settings: {
              apiProvider: "x",
              model: "m",
              runStartedAt: now,
            },
          })}
          running
          onUpdateSettings={() => {}}
          onUpdatePrompt={() => {}}
          onRun={() => {}}
        />
      </QueryClientProvider>,
    );
    const btn = screen.getByTestId("legacy-gen-run-g2");
    expect(btn.textContent).toMatch(/0(\.0)?s|0ms|generating/i);
  });

  it("does not open at stale ~10s when prior runStartedAt lingers", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const now = 1_700_000_200_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(
      <QueryClientProvider client={client}>
        <GeneratorNodeBody
          node={createLegacyNode({
            id: "g3",
            kind: "generator",
            settings: {
              apiProvider: "x",
              model: "m",
              // Stale anchor from ~10s ago (the reported bug).
              runStartedAt: now - 10_000,
            },
          })}
          running
          onUpdateSettings={() => {}}
          onUpdatePrompt={() => {}}
          onRun={() => {}}
        />
      </QueryClientProvider>,
    );
    const btn = screen.getByTestId("legacy-gen-run-g3");
    expect(btn.textContent).not.toMatch(/10\.0s/);
    expect(btn.textContent).toMatch(/0(\.0)?s|0ms|generating/i);
  });

  it("renders count stepper for API generator", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onUpdateSettings = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <GeneratorNodeBody
          node={createLegacyNode({
            id: "g4",
            kind: "generator",
            settings: { apiProvider: "x", model: "m", count: 2 },
          })}
          running={false}
          onUpdateSettings={onUpdateSettings}
          onUpdatePrompt={() => {}}
          onRun={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("legacy-gen-count-g4-input")).toHaveValue("2");
    fireEvent.click(screen.getByTestId("legacy-gen-count-g4-inc"));
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ count: 3 }),
    );
  });
});
