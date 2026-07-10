import { describe, expect, it } from "vitest";
import {
  normalizeCheckUpdateResponse,
  type CheckUpdateApiResponse,
} from "../../src/shared/api/checkUpdate";

describe("check-update contract", () => {
  it("maps backend update_available and nested latest fields", () => {
    const raw: CheckUpdateApiResponse = {
      current: "2026.07.6",
      latest: {
        version: "2026.07.8",
        release_url: "https://github.com/Aliax-LI/Infinite-Canvas-V1/releases/tag/v2026.07.8",
        release_notes: "- bug fixes",
      },
      update_available: true,
      desktop_build_id: "desktop-test",
      reachable: true,
      error: "",
    };

    expect(normalizeCheckUpdateResponse(raw)).toEqual({
      current: "2026.07.6",
      latestVersion: "2026.07.8",
      updateAvailable: true,
      releaseUrl:
        "https://github.com/Aliax-LI/Infinite-Canvas-V1/releases/tag/v2026.07.8",
      releaseNotes: "- bug fixes",
      reachable: true,
    });
  });

  it("treats missing update as unavailable even when legacy fields are absent", () => {
    const raw: CheckUpdateApiResponse = {
      current: "2026.07.8",
      latest: {
        version: "2026.07.8",
        release_url: "https://github.com/Aliax-LI/Infinite-Canvas-V1/releases",
        release_notes: "",
      },
      update_available: false,
      reachable: true,
      error: "",
    };

    expect(normalizeCheckUpdateResponse(raw).updateAvailable).toBe(false);
  });

  it("handles unreachable GitHub with empty latest object", () => {
    const raw: CheckUpdateApiResponse = {
      current: "2026.07.6",
      latest: {},
      update_available: false,
      reachable: false,
      error: "timeout",
    };

    expect(normalizeCheckUpdateResponse(raw)).toMatchObject({
      latestVersion: "",
      updateAvailable: false,
      releaseUrl: undefined,
      releaseNotes: undefined,
      reachable: false,
      error: "timeout",
    });
  });
});
