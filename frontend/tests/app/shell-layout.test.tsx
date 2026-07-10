import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ShellLayout } from "../../src/app/ShellLayout";
import "../../src/shared/i18n";

vi.mock("../../src/features/update/hooks", () => ({
  useCheckUpdate: () => ({
    data: {
      current: "2026.7.6",
      latestVersion: "2026.7.6",
      updateAvailable: false,
      reachable: true,
    },
  }),
}));

function renderShell(initial = "/canvases") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/" element={<ShellLayout />}>
            <Route path="canvases" element={<div data-testid="canvases-page">canvases</div>} />
            <Route path="settings" element={<div data-testid="settings-page">settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ShellLayout sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders collapsed sidebar with icon nav and bottom toggles", () => {
    renderShell();
    const sidebar = screen.getByTestId("shell-sidebar");
    expect(sidebar.className).not.toContain("is-pinned");
    expect(sidebar.getAttribute("data-sidebar-pinned")).toBe("false");
    expect(screen.getByTestId("sidebar-pin-toggle")).toBeTruthy();
    expect(screen.getByTestId("lang-toggle")).toBeTruthy();
    expect(screen.getByTestId("theme-toggle")).toBeTruthy();
    expect(screen.getByTestId("nav-canvases")).toBeTruthy();
  });

  it("pins sidebar and persists state in localStorage", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("sidebar-pin-toggle"));
    const sidebar = screen.getByTestId("shell-sidebar");
    expect(sidebar.className).toContain("is-pinned");
    expect(sidebar.getAttribute("data-sidebar-pinned")).toBe("true");
    expect(screen.getByTestId("sidebar-pin-toggle").getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("studio_sidebar_pinned")).toBe("1");
  });

  it("restores pinned sidebar from localStorage", () => {
    localStorage.setItem("studio_sidebar_pinned", "1");
    renderShell();
    expect(screen.getByTestId("shell-sidebar").className).toContain("is-pinned");
  });

  it("shows nav labels when pinned", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("sidebar-pin-toggle"));
    expect(screen.getByText("画布列表")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.getByText("中文")).toBeTruthy();
    expect(screen.getByText("深色模式")).toBeTruthy();
  });

  it("navigates via sidebar links", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("nav-settings"));
    expect(screen.getByTestId("settings-page")).toBeTruthy();
  });
});
