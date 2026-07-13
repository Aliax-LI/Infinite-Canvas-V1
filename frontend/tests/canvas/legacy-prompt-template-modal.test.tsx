import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, type ReactElement } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LegacyPromptTemplateModal } from "../../src/features/canvas/components/LegacyPromptTemplateModal";
import "../../src/shared/i18n";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from "../../src/shared/api/client";

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const libraryPayload = {
  library: {
    active_library_id: "system",
    libraries: [
      {
        id: "system",
        name: "系统提示词库",
        readonly: false,
        categories: [
          { id: "view", name: "视角" },
          { id: "character", name: "角色" },
          { id: "custom", name: "我的" },
        ],
        items: [
          {
            id: "builtin_md_1",
            name: "俯拍城市",
            positive: "aerial shot of neon city",
            negative: "blurry, lowres",
            scene: "夜景鸟瞰",
            category: "view",
            params: { steps: "28" },
            builtin: true,
          },
          {
            id: "builtin_md_2",
            name: "角色特写",
            positive: "close-up portrait",
            scene: "人物脸部",
            category: "character",
            builtin: true,
          },
        ],
      },
    ],
  },
};

describe("LegacyPromptTemplateModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue(libraryPayload);
  });

  it("loads real template names and applies full content", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    wrap(
      <LegacyPromptTemplateModal
        open
        currentPrompt="当前提示词"
        onApply={onApply}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("prompt-template-builtin_md_1")).toBeTruthy();
    });

    expect(screen.getAllByText("俯拍城市").length).toBeGreaterThan(0);
    expect(screen.getByText("夜景鸟瞰")).toBeTruthy();
    expect(screen.queryByText("没有匹配的模板")).toBeNull();
    expect(screen.getByTestId("prompt-template-positive").textContent).toContain(
      "aerial shot of neon city",
    );

    fireEvent.click(screen.getByTestId("prompt-template-apply-full"));
    expect(onApply).toHaveBeenCalledWith(
      "aerial shot of neon city\n\nNegative prompt:\nblurry, lowres\n\nParams:\nsteps: 28",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("filters by category chip", async () => {
    wrap(
      <LegacyPromptTemplateModal open onApply={vi.fn()} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("prompt-template-builtin_md_1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("prompt-template-cat-character"));
    expect(screen.getByTestId("prompt-template-builtin_md_2")).toBeTruthy();
    expect(screen.queryByTestId("prompt-template-builtin_md_1")).toBeNull();
    expect(screen.getAllByText("角色特写").length).toBeGreaterThan(0);
  });

  it("does not render empty placeholder cards for name/positive data", async () => {
    wrap(
      <LegacyPromptTemplateModal open onApply={vi.fn()} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("prompt-template-builtin_md_1")).toBeTruthy();
    });

    const card = screen.getByTestId("prompt-template-builtin_md_1");
    expect(card.textContent).toContain("俯拍城市");
    expect(card.textContent).not.toMatch(/^\s*$/);
  });
});
