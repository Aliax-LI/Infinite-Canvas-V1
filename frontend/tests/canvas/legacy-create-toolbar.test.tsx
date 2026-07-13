import { describe, expect, it, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LegacyCreateToolbar } from "../../src/features/canvas/components/LegacyCreateToolbar";

const baseProps = {
  title: "测试画布",
  dirty: true,
  assetOpen: false,
  knifeMode: false,
  selectedCount: 0,
  onCreate: vi.fn(),
  onGroup: vi.fn(),
  onToggleAssets: vi.fn(),
  onOpenLogs: vi.fn(),
  onOpenWorkflow: vi.fn(),
  onOpenShortcuts: vi.fn(),
  onToggleKnife: vi.fn(),
  onFit: vi.fn(),
};

describe("LegacyCreateToolbar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses pointer-events-none overlay root with auto chrome chips", () => {
    render(
      <MemoryRouter>
        <LegacyCreateToolbar {...baseProps} />
      </MemoryRouter>,
    );
    const root = screen.getByTestId("legacy-create-toolbar");
    expect(root.className).toMatch(/pointer-events-none/);
    expect(screen.getByTestId("legacy-quick-toolbar").className).toMatch(/pointer-events-auto/);
    expect(screen.getByTestId("legacy-edit-cluster").className).toMatch(/pointer-events-auto/);
  });

  it("starts collapsed with only fixed chrome visible", () => {
    render(
      <MemoryRouter>
        <LegacyCreateToolbar {...baseProps} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("legacy-toolbar-items")).toBeNull();
    expect(screen.queryByTestId("legacy-create-prompt")).toBeNull();
    expect(screen.getByTestId("legacy-export-workflow-btn")).toBeTruthy();
    expect(screen.getByTestId("legacy-asset-btn")).toBeTruthy();
    expect(screen.getByTestId("legacy-log-btn")).toBeTruthy();
    expect(screen.queryByTestId("legacy-save-btn")).toBeNull();
  });

  it("shows dirty badge without a manual save button", () => {
    render(
      <MemoryRouter>
        <LegacyCreateToolbar {...baseProps} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("legacy-dirty-badge")).toBeTruthy();
    expect(screen.queryByTestId("legacy-save-btn")).toBeNull();
  });

  it("wires create and chrome handlers", () => {
    render(
      <MemoryRouter>
        <LegacyCreateToolbar {...baseProps} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("legacy-toolbar-toggle"));
    expect(screen.getByTestId("legacy-toolbar-items")).toBeTruthy();
    fireEvent.click(screen.getByTestId("legacy-create-prompt"));
    expect(baseProps.onCreate).toHaveBeenCalledWith("prompt");
    fireEvent.click(screen.getByTestId("legacy-create-group"));
    expect(baseProps.onGroup).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("legacy-asset-btn"));
    expect(baseProps.onToggleAssets).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("legacy-toolbar-toggle"));
    expect(screen.queryByTestId("legacy-toolbar-items")).toBeNull();
  });
});

describe("LegacyCanvasPage chrome blocker", () => {
  it("ignores floating create toolbar in viewport pointer handlers", () => {
    const src = readFileSync(
      resolve(__dirname, "../../src/features/canvas/LegacyCanvasPage.tsx"),
      "utf8",
    );
    expect(src).toMatch(/legacy-create-toolbar/);
    expect(src).toMatch(/LEGACY_UI_BLOCKER/);
    expect(src).not.toMatch(
      /closest\(\s*"\[data-testid='quick-toolbar'\], \[data-testid='legacy-minimap'\]/,
    );
  });

  it("mutually excludes workflow / assets / logs / shortcuts panels", () => {
    const src = readFileSync(
      resolve(__dirname, "../../src/features/canvas/LegacyCanvasPage.tsx"),
      "utf8",
    );
    expect(src).toMatch(/if \(workflowPanelOpen\) \{\s*setWorkflowPanelOpen\(false\)/s);
    expect(src).toMatch(/setWorkflowPanelOpen\(true\);\s*setAssetOpen\(false\);\s*setLogOpen\(false\);\s*setShortcutsOpen\(false\)/s);
    expect(src).toMatch(/setAssetOpen\(true\);\s*setLogOpen\(false\);\s*setWorkflowPanelOpen\(false\);\s*setShortcutsOpen\(false\)/s);
    expect(src).toMatch(/setLogOpen\(true\);\s*setAssetOpen\(false\);\s*setWorkflowPanelOpen\(false\);\s*setShortcutsOpen\(false\)/s);
  });
});

describe("SmartCanvasPage chrome exclusivity", () => {
  it("mutually excludes transfer / assets / logs / shortcuts panels", () => {
    const src = readFileSync(
      resolve(__dirname, "../../src/features/smart-canvas/SmartCanvasPage.tsx"),
      "utf8",
    );
    expect(src).toMatch(/if \(transferOpen\) \{\s*setTransferOpen\(false\)/s);
    expect(src).toMatch(/setTransferOpen\(true\);\s*setAssetOpen\(false\);\s*setLogOpen\(false\);\s*setShortcutOpen\(false\)/s);
    expect(src).toMatch(/setAssetOpen\(true\);\s*setLogOpen\(false\);\s*setShortcutOpen\(false\);\s*setTransferOpen\(false\)/s);
  });
});
