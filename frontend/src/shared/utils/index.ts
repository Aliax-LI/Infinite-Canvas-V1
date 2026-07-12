import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function escapeHtml(str: unknown): string {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        s
      ] ?? s,
  );
}

export function formatTime(value: number | undefined, locale = "zh-CN"): string {
  if (!value) return "--";
  const raw = Number(value);
  const time = raw < 10_000_000_000 ? raw * 1000 : raw;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export { rangeFillPercent, rangeFillStyle } from "./rangeFillStyle";

export const CLIENT_ID_KEY = "smart_canvas_client_id";

export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "web-client";
  }
}
