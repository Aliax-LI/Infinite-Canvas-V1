import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratePanel } from "../../src/features/canvas/components/GeneratePanel";
import { LtxTimelinePanel } from "../../src/features/canvas/components/LtxTimelinePanel";
import type { GeneratePanelSettings } from "../../src/features/canvas/core/types";
import "../../src/shared/i18n";

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

function pickStudioOption(testId: string, value: string) {
  fireEvent.click(screen.getByTestId(`${testId}-trigger`));
  fireEvent.click(screen.getByTestId(`${testId}-option-${value}`));
}

const baseGenerate: GeneratePanelSettings = {
  prompt: "a cat",
  engine: "api",
  kind: "image",
  params: {},
};

function StatefulGeneratePanel({
  initial = baseGenerate,
}: {
  initial?: GeneratePanelSettings;
}) {
  const [generate, setGenerateState] = useState(initial);
  const setGenerate = (patch: Partial<GeneratePanelSettings>) => {
    setGenerateState((prev) => ({
      ...prev,
      ...patch,
      params: patch.params ? { ...prev.params, ...patch.params } : prev.params,
    }));
  };
  return (
    <GeneratePanel
      generate={generate}
      setGenerate={setGenerate}
      generating={false}
      generateError={null}
      onGenerate={vi.fn()}
      onAddNode={vi.fn()}
    />
  );
}

describe("GeneratePanel", () => {
  beforeEach(() => {
    apiMock.get.mockResolvedValue({
      api_providers: [
        {
          id: "comfly",
          name: "Comfly",
          enabled: true,
          primary: true,
          image_models: ["gpt-image-1", "dall-e-3"],
          protocol: "openai",
        },
        {
          id: "modelscope",
          name: "ModelScope",
          enabled: true,
          image_models: ["Qwen/Qwen-Image"],
        },
      ],
    });
  });

  it("loads providers and models from /api/config", async () => {
    wrap(<StatefulGeneratePanel />);

    await waitFor(() => {
      expect(screen.getByTestId("legacy-provider-trigger").textContent).toContain(
        "Comfly",
      );
    });
    expect(screen.getByTestId("legacy-model-trigger").textContent).toContain(
      "gpt-image-1",
    );
    expect(screen.getByTestId("legacy-size-label").textContent).toBe("1024x1024");
  });

  it("updates provider and model params when selections change", async () => {
    wrap(
      <StatefulGeneratePanel
        initial={{
          ...baseGenerate,
          params: {
            provider_id: "comfly",
            model: "gpt-image-1",
            ratio: "square",
            resolution: "1k",
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-provider-trigger").textContent).toContain(
        "Comfly",
      );
    });

    pickStudioOption("legacy-provider", "modelscope");
    await waitFor(() => {
      expect(screen.getByTestId("legacy-model-trigger").textContent).toContain(
        "Qwen/Qwen-Image",
      );
    });
  });

  it("shows ComfyUI workflow controls when Comfy tab is active", async () => {
    wrap(
      <GeneratePanel
        generate={{ ...baseGenerate, engine: "comfy", params: {} }}
        setGenerate={vi.fn()}
        generating={false}
        generateError={null}
        onGenerate={vi.fn()}
        onAddNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId("legacy-comfy-options")).toBeTruthy();
    expect(screen.getByTestId("legacy-comfy-workflow-trigger")).toBeTruthy();
    expect(screen.queryByTestId("legacy-api-options")).toBeNull();
  });

  it("switches engine via tabs", async () => {
    const setGenerate = vi.fn();
    wrap(
      <GeneratePanel
        generate={baseGenerate}
        setGenerate={setGenerate}
        generating={false}
        generateError={null}
        onGenerate={vi.fn()}
        onAddNode={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("legacy-engine-tab-comfy"));
    expect(setGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "comfy",
        params: expect.objectContaining({
          workflow_json: "z-image-t2i.json",
          type: "zimage",
        }),
      }),
    );
  });
});

describe("LtxTimelinePanel", () => {
  it("shows coming soon badge and explanation instead of interactive scaffold", () => {
    wrap(<LtxTimelinePanel />);
    expect(screen.getByTestId("ltx-timeline-panel")).toBeTruthy();
    expect(screen.getByTestId("ltx-timeline-badge").textContent).toMatch(/coming soon|即将推出/i);
    expect(screen.queryByTestId("ltx-timeline")).toBeNull();
    expect(screen.queryByTestId("timeline-add-btn")).toBeNull();
    expect(screen.queryByTestId("ltx-timeline-smart-link")).toBeNull();
  });
});

describe("LegacyCanvasPage sidebar (Option B)", () => {
  it("does not mount GeneratePanel or LtxTimelinePanel", () => {
    const src = readFileSync(
      resolve(__dirname, "../../src/features/canvas/LegacyCanvasPage.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/import\s*\{\s*GeneratePanel\s*\}/);
    expect(src).not.toMatch(/import\s*\{\s*LtxTimelinePanel\s*\}/);
    expect(src).not.toMatch(/<GeneratePanel[\s>]/);
    expect(src).not.toMatch(/<LtxTimelinePanel[\s/>]/);
    expect(src).not.toMatch(/legacy-generate-panel/);
  });
});
