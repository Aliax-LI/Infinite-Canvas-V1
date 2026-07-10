import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { App } from "../src/App";

vi.mock("../src/features/update/hooks", () => ({
  useAppInfo: () => ({ data: { version: "2026.7.6" } }),
  useCheckUpdate: () => ({
    data: {
      current: "2026.7.6",
      latestVersion: "2026.7.6",
      updateAvailable: false,
      reachable: true,
    },
  }),
}));

vi.mock("../src/features/canvas-list/api", () => ({
  canvasListApi: {
    listCanvases: vi.fn().mockResolvedValue({ canvases: [] }),
    listTrash: vi.fn().mockResolvedValue({ canvases: [], retention_days: 30 }),
    createCanvas: vi.fn(),
    deleteCanvas: vi.fn(),
    restoreCanvas: vi.fn(),
    purgeCanvas: vi.fn(),
    updateMeta: vi.fn(),
  },
  projectApi: {
    list: vi.fn().mockResolvedValue({ projects: [{ id: "default", name: "默认项目" }] }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

function renderApp(initial = "/canvases") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <App />,
        children: [{ path: "canvases", element: <div>canvases</div> }],
      },
    ],
    { initialEntries: [initial] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  it("renders router provider without crash", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
