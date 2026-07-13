import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { GeneratorNodeBody } from "../../src/features/canvas/components/GeneratorNodeBody";
import { createLegacyNode } from "../../src/features/canvas/core/types";
import { canConnect } from "../../src/features/canvas/core/connectRules";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../src/shared/api/client", () => ({
  api: apiMock,
}));

const CONFIG = {
  has_ms_key: true,
  comfy_instances: ["127.0.0.1:8188"],
  api_providers: [
    {
      id: "comfly",
      name: "Comfly",
      enabled: true,
      has_key: true,
      image_models: ["flux", "gpt-image-1"],
      chat_models: ["gpt-4o"],
    },
    {
      id: "other",
      name: "Other",
      enabled: true,
      has_key: true,
      image_models: ["sdxl"],
      chat_models: [],
    },
    {
      id: "modelscope",
      name: "ModelScope",
      enabled: true,
      has_key: true,
      image_models: ["Tongyi-MAI/Z-Image-Turbo"],
      chat_models: [],
      ms_loras: [],
    },
  ],
  image_models: ["flux", "gpt-image-1"],
};

const CONFIG_NO_MS_KEY = {
  ...CONFIG,
  has_ms_key: false,
  api_providers: CONFIG.api_providers.map((p) =>
    p.id === "modelscope" ? { ...p, has_key: false } : p,
  ),
};

function renderBody(
  node = createLegacyNode({ id: "gen1", kind: "generator", prompt: "" }),
  onUpdateSettings = vi.fn(),
  onRun = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onUpdateSettings,
    onRun,
    ...render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <GeneratorNodeBody
            node={node}
            running={false}
            onUpdateSettings={onUpdateSettings}
            onUpdatePrompt={() => {}}
            onRun={onRun}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  };
}

function pickStudioOption(testId: string, value: string) {
  fireEvent.click(screen.getByTestId(`${testId}-trigger`));
  fireEvent.click(screen.getByTestId(`${testId}-option-${value}`));
}

describe("GeneratorNodeBody provider/model", () => {
  beforeEach(() => {
    apiMock.get.mockResolvedValue(CONFIG);
  });

  afterEach(() => cleanup());

  it("writes apiProvider + model into settings when selecting provider", async () => {
    const { onUpdateSettings } = renderBody(
      createLegacyNode({
        id: "gen1",
        kind: "generator",
        settings: { apiProvider: "comfly", model: "flux" },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("legacy-gen-provider-gen1-trigger").textContent,
      ).toContain("Comfly");
    });

    pickStudioOption("legacy-gen-provider-gen1", "other");

    expect(onUpdateSettings).toHaveBeenCalled();
    const last = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(last.apiProvider).toBe("other");
    expect(last.provider_id).toBe("other");
    expect(last.model).toBe("sdxl");
  });

  it("writes model into settings when selecting model", async () => {
    const { onUpdateSettings } = renderBody(
      createLegacyNode({
        id: "gen1",
        kind: "generator",
        settings: { apiProvider: "comfly", model: "flux" },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("legacy-gen-model-gen1-trigger").textContent,
      ).toContain("flux");
    });

    pickStudioOption("legacy-gen-model-gen1", "gpt-image-1");

    const last = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(last.model).toBe("gpt-image-1");
  });

  it("allows image → generator connection (canConnect)", () => {
    const image = createLegacyNode({ id: "img1", kind: "image" });
    const generator = createLegacyNode({ id: "gen1", kind: "generator" });
    expect(canConnect("img1", "gen1", [image, generator], [])).toBe(true);
  });

  it("shows wired LLM input and media badge from upstream edges", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <GeneratorNodeBody
            node={createLegacyNode({
              id: "l1",
              kind: "llm",
              settings: { llmProvider: "comfly", model: "gpt-4o" },
            })}
            running={false}
            llmWiredInput="A multi-camera angle reference sheet"
            llmWiredImageCount={1}
            llmWiredVideoCount={0}
            onUpdateSettings={() => {}}
            onUpdatePrompt={() => {}}
            onRun={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-llm-input-l1")).toHaveValue(
        "A multi-camera angle reference sheet",
      );
    });
    expect(screen.getByTestId("legacy-llm-input-l1")).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByTestId("legacy-llm-input-l1").className).toMatch(
      /bg-\[#f8fafc\]/,
    );
    expect(screen.getByTestId("legacy-llm-input-l1")).toHaveAttribute(
      "data-from-wire",
      "1",
    );
    expect(screen.getByTestId("legacy-llm-media-badge-l1").textContent).toMatch(
      /已连接|Connected/,
    );
    expect(screen.getByText(/来自连线|from connection/)).toBeTruthy();
  });

  it("renders ModelScope tabs and LoRA guidance", async () => {
    const { onUpdateSettings } = renderBody(
      createLegacyNode({
        id: "ms1",
        kind: "msgen",
        settings: { msgenModel: "zimage", count: 1 },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-msgen-tabs-ms1")).toBeTruthy();
    });
    expect(screen.getByTestId("legacy-msgen-tab-zimage-ms1")).toHaveAttribute(
      "data-active",
      "1",
    );
    expect(screen.getByTestId("legacy-msgen-lora-hint-ms1").textContent).toMatch(
      /noLoraForModel|LoRA/,
    );
    fireEvent.click(screen.getByTestId("legacy-msgen-tab-qwen_edit-ms1"));
    expect(onUpdateSettings).toHaveBeenCalled();
    const last = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(last.msgenModel).toBe("qwen_edit");
  });

  it("grays out msgen and disables run when ModelScope key missing", async () => {
    apiMock.get.mockResolvedValue(CONFIG_NO_MS_KEY);
    const onRun = vi.fn();
    renderBody(
      createLegacyNode({
        id: "ms1",
        kind: "msgen",
        settings: { msgenModel: "zimage" },
      }),
      vi.fn(),
      onRun,
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-config-gate-ms1")).toBeTruthy();
    });
    expect(screen.getByTestId("legacy-msgen-body-ms1")).toHaveAttribute(
      "data-config-blocked",
      "1",
    );
    const runBtn = screen.getByTestId("legacy-msgen-run-ms1");
    expect(runBtn).toBeDisabled();
    fireEvent.click(runBtn);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByTestId("legacy-config-gate-link-ms1")).toHaveAttribute(
      "href",
      "/settings/api",
    );
  });

  it("grays out API generator when provider key missing", async () => {
    apiMock.get.mockResolvedValue({
      ...CONFIG,
      api_providers: CONFIG.api_providers.map((p) =>
        p.id === "comfly" ? { ...p, has_key: false } : p,
      ),
    });
    const onRun = vi.fn();
    renderBody(
      createLegacyNode({
        id: "gen1",
        kind: "generator",
        settings: { apiProvider: "comfly", model: "flux" },
      }),
      vi.fn(),
      onRun,
    );

    await waitFor(() => {
      expect(screen.getByTestId("legacy-config-gate-gen1")).toBeTruthy();
    });
    expect(screen.getByTestId("legacy-gen-run-gen1")).toBeDisabled();
  });
});
