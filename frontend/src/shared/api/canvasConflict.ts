import { ApiError } from "./client";

/** Extract remote `updated_at` from a canvas PUT 409 conflict body. */
export function conflictCanvasUpdatedAt(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body;
  if (typeof body !== "object" || body === null) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return null;
  const record = detail as {
    updated_at?: unknown;
    canvas?: { updated_at?: unknown };
  };
  const ts = Number(record.updated_at ?? record.canvas?.updated_at ?? 0);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}
