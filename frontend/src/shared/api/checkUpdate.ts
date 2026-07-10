/** Backend contract for GET /api/check-update (matches history/main.py). */

export interface CheckUpdateLatest {
  version?: string;
  release_url?: string;
  release_notes?: string;
}

export interface CheckUpdateApiResponse {
  current: string;
  latest: CheckUpdateLatest;
  update_available: boolean;
  desktop_build_id?: string;
  reachable?: boolean;
  error?: string;
}

/** Normalized view model consumed by renderer update UI. */
export interface CheckUpdateView {
  current: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  reachable: boolean;
  error?: string;
}

export function normalizeCheckUpdateResponse(
  raw: CheckUpdateApiResponse,
): CheckUpdateView {
  const latest = raw.latest ?? {};
  return {
    current: String(raw.current ?? ""),
    latestVersion: String(latest.version ?? ""),
    updateAvailable: Boolean(raw.update_available),
    releaseUrl: latest.release_url || undefined,
    releaseNotes: latest.release_notes || undefined,
    reachable: Boolean(raw.reachable),
    error: raw.error || undefined,
  };
}

export async function fetchCheckUpdate(
  get: <T>(path: string) => Promise<T>,
): Promise<CheckUpdateView> {
  const raw = await get<CheckUpdateApiResponse>("/api/check-update");
  return normalizeCheckUpdateResponse(raw);
}
