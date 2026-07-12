import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { ToolsHubPage } from "../../src/features/tools/ToolsHubPage";
import { EnhancePage } from "../../src/features/tools/pages/EnhancePage";
import { AnglePage } from "../../src/features/tools/pages/AnglePage";
import { KleinPage } from "../../src/features/tools/pages/KleinPage";
import { ZimagePage } from "../../src/features/tools/pages/ZimagePage";
import { api } from "../../src/shared/api/client";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn((path: string) => {
      if (path === "/api/comfyui/upscale-availability") {
        return Promise.resolve({ upscale_available: true });
      }
      if (path.startsWith("/api/comfyui/workflow-availability")) {
        return Promise.resolve({
          available: true,
          missing_nodes: [],
          missing_models: [],
        });
      }
      if (path === "/api/config") {
        return Promise.resolve({});
      }
      if (path === "/api/workflows") {
        return Promise.resolve({ workflows: [] });
      }
      return Promise.resolve({});
    }),
    post: vi.fn(),
    upload: vi.fn(),
  },
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

describe("ToolsHubPage", () => {
  it("renders polished hub with subtitle and tool cards", () => {
    wrap(<ToolsHubPage />);
    expect(screen.getByTestId("tools-hub-page")).toBeInTheDocument();
    expect(screen.getByText(/本地 ComfyUI 工具/)).toBeInTheDocument();
    expect(screen.getByTestId("tool-link-enhance")).toBeInTheDocument();
    expect(screen.getByTestId("tool-link-klein")).toBeInTheDocument();
    expect(screen.getByTestId("tool-link-zimage")).toBeInTheDocument();
    expect(screen.getByTestId("tool-link-angle")).toBeInTheDocument();
    expect(screen.getByTestId("tool-link-online")).toBeInTheDocument();
    expect(screen.getByText("在线生图")).toBeInTheDocument();
    expect(within(screen.getByTestId("tool-tags-online")).getByText("云端 API")).toBeInTheDocument();
  });

  it("shows local and cloud tags for Klein, Z-Image, and Angle", () => {
    wrap(<ToolsHubPage />);

    for (const tool of ["klein", "zimage", "angle"] as const) {
      const tags = within(screen.getByTestId(`tool-tags-${tool}`));
      expect(tags.getByText("本地")).toBeInTheDocument();
      expect(tags.getByText("云端 API")).toBeInTheDocument();
    }

    const enhanceTags = within(screen.getByTestId("tool-tags-enhance"));
    expect(enhanceTags.getByText("本地")).toBeInTheDocument();
    expect(enhanceTags.queryByText("云端 API")).not.toBeInTheDocument();
  });
});

describe("EnhancePage", () => {
  it("uses workbench layout and disables submit until upload", () => {
    wrap(<EnhancePage />);
    expect(screen.getByTestId("enhance-page")).toBeInTheDocument();
    expect(screen.getByTestId("enhance-submit")).toBeDisabled();
    expect(screen.getByTestId("enhance-result-empty")).toBeInTheDocument();
  });

  it("submits official z-image-enhance workflow payload", async () => {
    vi.mocked(api.upload).mockResolvedValueOnce({
      files: [{ comfy_name: "input.png" }],
    });
    vi.mocked(api.post).mockResolvedValueOnce({
      images: ["/assets/output/enhance_test.png"],
    });

    wrap(<EnhancePage />);
    const file = new File(["pixels"], "input.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("enhance-upload"), {
      dataTransfer: { files: [file] },
    });

    await vi.waitFor(() => expect(screen.getByTestId("enhance-submit")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("enhance-submit"));

    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = vi.mocked(api.post).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload.workflow_json).toBe("z-image-enhance.json");
    expect(payload.type).toBe("enhance");
    expect(payload.params).toEqual({
      "15": { image: "input.png" },
      "204": { value: 0.5 },
    });
  });

  it("disables upscale checkbox when SeedVR2 nodes unavailable", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/comfyui/upscale-availability") {
        return Promise.resolve({ upscale_available: false, reason: "missing nodes" });
      }
      if (path.includes("workflow=upscale.json")) {
        return Promise.resolve({
          available: false,
          missing_nodes: ["SeedVR2LoadDiTModel"],
          missing_models: [],
          reason: "缺少自定义节点: SeedVR2LoadDiTModel",
        });
      }
      if (path.startsWith("/api/comfyui/workflow-availability")) {
        return Promise.resolve({ available: true, missing_nodes: [], missing_models: [] });
      }
      return Promise.resolve({});
    });

    wrap(<EnhancePage />);

    await vi.waitFor(() => {
      expect(screen.getByTestId("enhance-upscale")).toBeDisabled();
      expect(screen.getByTestId("enhance-upscale-hint")).toBeInTheDocument();
    });
  });

  it("shows workflow export button on enhance page", async () => {
    wrap(<EnhancePage />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("enhance-workflow-export")).toBeInTheDocument();
    });
  });

  it("disables local submit when workflow nodes missing", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/comfyui/upscale-availability") {
        return Promise.resolve({ upscale_available: true });
      }
      if (path.includes("z-image-enhance.json")) {
        return Promise.resolve({
          available: false,
          missing_nodes: ["CustomEnhanceNode"],
          missing_models: [],
        });
      }
      return Promise.resolve({ available: true, missing_nodes: [], missing_models: [] });
    });

    wrap(<EnhancePage />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("enhance-availability-hint")).toBeInTheDocument();
      expect(screen.getByTestId("enhance-submit")).toBeDisabled();
    });
  });
});

describe("AnglePage", () => {
  it("exposes local and ModelScope engine switch", () => {
    wrap(<AnglePage />);
    expect(screen.getByTestId("angle-page")).toBeInTheDocument();
    expect(screen.getByTestId("angle-engine")).toBeInTheDocument();
    expect(screen.getByTestId("angle-engine-local")).toBeInTheDocument();
    expect(screen.getByTestId("angle-engine-cloud")).toBeInTheDocument();
  });

  it("shows cloud model selector when engine is cloud", () => {
    wrap(<AnglePage />);
    fireEvent.click(screen.getByTestId("angle-engine-cloud"));
    expect(screen.getByTestId("angle-cloud-model")).toBeInTheDocument();
  });
});

describe("KleinPage", () => {
  it("exposes local and ModelScope engine switch", () => {
    wrap(<KleinPage />);
    expect(screen.getByTestId("klein-page")).toBeInTheDocument();
    expect(screen.getByTestId("klein-engine")).toBeInTheDocument();
    expect(screen.getByTestId("klein-engine-local")).toBeInTheDocument();
    expect(screen.getByTestId("klein-engine-cloud")).toBeInTheDocument();
  });

  it("shows three ref slots and workflow export/availability in local mode", () => {
    wrap(<KleinPage />);
    expect(screen.getByTestId("klein-slot-1")).toBeInTheDocument();
    expect(screen.getByTestId("klein-slot-2")).toBeInTheDocument();
    expect(screen.getByTestId("klein-slot-3")).toBeInTheDocument();
    expect(screen.getByTestId("klein-workflow-export")).toBeInTheDocument();
    expect(screen.queryByTestId("klein-resolution")).not.toBeInTheDocument();
  });

  it("shows cloud model selector, LoRA, and single main slot in cloud mode", () => {
    wrap(<KleinPage />);
    fireEvent.click(screen.getByTestId("klein-engine-cloud"));
    expect(screen.getByTestId("klein-cloud-model")).toBeInTheDocument();
    expect(screen.queryByTestId("klein-cloud-main-hint")).not.toBeInTheDocument();
    expect(screen.getByTestId("klein-lora-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("klein-slot-1")).toBeInTheDocument();
    expect(screen.queryByTestId("klein-slot-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("klein-slot-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("klein-workflow-export")).not.toBeInTheDocument();
  });
});

describe("ZimagePage", () => {
  it("exposes official workflow options by default", () => {
    wrap(<ZimagePage />);
    expect(screen.getByTestId("zimage-workflow")).toBeInTheDocument();
  });

  it("shows control upload when control workflow selected", () => {
    wrap(<ZimagePage />);
    fireEvent.click(screen.getByTestId("zimage-workflow-trigger"));
    fireEvent.click(screen.getByText("Z-Image 控制生图"));
    expect(screen.getByTestId("zimage-control-type")).toBeInTheDocument();
    expect(screen.getByTestId("zimage-control-upload")).toBeInTheDocument();
    expect(screen.getByTestId("zimage-control-resolution")).toBeInTheDocument();
    expect(screen.getByTestId("zimage-control-res-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("zimage-width")).not.toBeInTheDocument();
    expect(screen.queryByTestId("zimage-control-model-hint")).not.toBeInTheDocument();
  });

  it("shows custom width/height when control resolution is custom", () => {
    wrap(<ZimagePage />);
    fireEvent.click(screen.getByTestId("zimage-workflow-trigger"));
    fireEvent.click(screen.getByText("Z-Image 控制生图"));
    fireEvent.click(screen.getByTestId("zimage-control-resolution-trigger"));
    fireEvent.click(screen.getByText("自定义宽高"));
    expect(screen.getByTestId("zimage-width")).toBeInTheDocument();
    expect(screen.getByTestId("zimage-height")).toBeInTheDocument();
    expect(screen.queryByTestId("zimage-control-res-hint")).not.toBeInTheDocument();
  });

  it("shows HF model hint for depth controller", () => {
    wrap(<ZimagePage />);
    fireEvent.click(screen.getByTestId("zimage-workflow-trigger"));
    fireEvent.click(screen.getByText("Z-Image 控制生图"));
    fireEvent.click(screen.getByTestId("zimage-control-type-trigger"));
    fireEvent.click(screen.getByText("深度 Depth"));
    expect(screen.getByTestId("zimage-control-model-hint")).toBeInTheDocument();
  });

  it("shows cloud model selector when engine is cloud", () => {
    wrap(<ZimagePage />);
    fireEvent.click(screen.getByTestId("zimage-engine-cloud"));
    expect(screen.getByTestId("zimage-cloud-model")).toBeInTheDocument();
  });

  it("shows export button and disables submit when local workflow unavailable", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith("/api/comfyui/workflow-availability")) {
        return Promise.resolve({
          available: false,
          missing_nodes: ["MissingNode"],
          missing_models: [],
        });
      }
      if (path === "/api/workflows") {
        return Promise.resolve({ workflows: [] });
      }
      if (path === "/api/config") {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    wrap(<ZimagePage />);
    fireEvent.change(screen.getByTestId("zimage-prompt"), { target: { value: "test prompt" } });

    await vi.waitFor(() => {
      expect(screen.getByTestId("zimage-workflow-export")).toBeInTheDocument();
      expect(screen.getByTestId("zimage-availability-hint")).toBeInTheDocument();
      expect(screen.getByTestId("zimage-submit")).toBeDisabled();
    });
  });
});
