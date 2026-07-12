import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  api_providers: [
    {
      id: "comfly",
      name: "Comfly",
      enabled: true,
      image_models: ["flux", "gpt-image-1"],
      chat_models: ["gpt-4o"],
    },
    {
      id: "other",
      name: "Other",
      enabled: true,
      image_models: ["sdxl"],
      chat_models: [],
    },
  ],
  image_models: ["flux", "gpt-image-1"],
};

function renderBody(
  node = createLegacyNode({ id: "gen1", kind: "generator", prompt: "" }),
  onUpdateSettings = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onUpdateSettings,
    ...render(
      <QueryClientProvider client={client}>
        <GeneratorNodeBody
          node={node}
          running={false}
          onUpdateSettings={onUpdateSettings}
          onUpdatePrompt={() => {}}
          onRun={() => {}}
        />
      </QueryClientProvider>,
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
});
