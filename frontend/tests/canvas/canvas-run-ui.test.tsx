import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
    expect(card.className).not.toContain("border-red");
    expect(card.className).not.toContain("bg-red");
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
    expect(card.className).toContain("border-red");
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
    const now = 200_000;
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
    expect(btn.textContent).toMatch(/0ms|generating/i);
  });
});
