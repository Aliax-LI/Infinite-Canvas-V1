import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "../../src/shared/i18n";
import { StorageSettingsPage } from "../../src/features/settings/storage/StorageSettingsPage";
import { formatBytes } from "../../src/features/settings/storage/formatBytes";

vi.mock("../../src/shared/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "../../src/shared/api/client";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("formatBytes", () => {
  it("formats zero and small values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});

describe("StorageSettingsPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/storage/stats") {
        return Promise.resolve({
          data_dir: "/tmp/infinite-canvas-data",
          database_path: "/tmp/infinite-canvas-data/infinite-canvas.db",
          database_bytes: 4096,
          objects_dir: "/tmp/infinite-canvas-data/objects",
          object_count: 2,
          objects_bytes: 8192,
          orphan_count: 0,
          orphan_bytes: 0,
          storage_backend: "sqlite",
        });
      }
      if (path === "/api/storage-health") {
        return Promise.resolve({
          storage_backend: "sqlite",
          ok: true,
          database: { ok: true, exists: true },
        });
      }
      if (path === "/api/storage/backups") {
        return Promise.resolve({
          backups: [
            {
              backup_dir: "/tmp/infinite-canvas-data/backups/full_backup_20260711",
              name: "full_backup_20260711",
              created_at_ms: 1_700_000_000_000,
            },
          ],
        });
      }
      return Promise.resolve({});
    });
    vi.mocked(api.post).mockReset();
  });

  it("renders storage stats and backup list", async () => {
    wrap(<StorageSettingsPage />);
    expect(await screen.findByTestId("storage-settings-page")).toBeTruthy();
    expect(await screen.findByText("/tmp/infinite-canvas-data")).toBeTruthy();
    expect(await screen.findByText("sqlite")).toBeTruthy();
    expect(await screen.findByTestId("storage-restore-btn-full_backup_20260711")).toBeTruthy();
  });

  it("creates backup on button click", async () => {
    vi.mocked(api.post).mockResolvedValue({
      ok: true,
      backup_dir: "/tmp/infinite-canvas-data/backups/full_backup_new",
    });
    wrap(<StorageSettingsPage />);
    await screen.findByTestId("storage-settings-page");
    fireEvent.click(screen.getByTestId("storage-create-backup-btn"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/storage/backup", {});
    });
    expect(await screen.findByTestId("studio-dialog")).toBeTruthy();
  });

  it("restores backup after confirmation", async () => {
    vi.mocked(api.post).mockResolvedValue({
      ok: true,
      restored_from: "/tmp/infinite-canvas-data/backups/full_backup_20260711",
      safety_backup_dir: "/tmp/infinite-canvas-data/backups/pre_restore/full_backup_safe",
    });
    wrap(<StorageSettingsPage />);
    await screen.findByTestId("storage-restore-btn-full_backup_20260711");
    fireEvent.click(screen.getByTestId("storage-restore-btn-full_backup_20260711"));
    expect(await screen.findByTestId("storage-restore-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("storage-restore-confirm"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/storage/restore", {
        backup_dir: "/tmp/infinite-canvas-data/backups/full_backup_20260711",
      });
    });
  });
});
