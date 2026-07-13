import { formatApiDetail, statusFallbackMessage, truncateErrorText } from "./formatError";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const USER_ID_KEY = "studio_user_id";

export function getUserId(): string {
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

function defaultHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("X-User-ID")) {
    headers.set("X-User-ID", getUserId());
  }
  const body = init?.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  if (body && !headers.has("Content-Type") && !isFormData && !isBlob) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function messageFromFailedResponse(
  status: number,
  statusText: string,
  data: unknown,
): string {
  if (typeof data === "object" && data !== null) {
    const record = data as {
      detail?: unknown;
      message?: unknown;
      error?: unknown;
      msg?: unknown;
    };
    const fromDetail = formatApiDetail(record.detail);
    if (fromDetail) return fromDetail;
    for (const key of ["message", "msg", "error"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return truncateErrorText(value);
      }
    }
  }
  if (typeof data === "string" && data.trim()) {
    return truncateErrorText(data);
  }
  if (statusText && statusText.trim() && statusText !== "Not Found") {
    return truncateErrorText(`${statusText} (HTTP ${status})`);
  }
  return statusFallbackMessage(status, `请求失败（HTTP ${status}）`);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = defaultHeaders(init);
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      messageFromFailedResponse(response.status, response.statusText, data),
      response.status,
      data,
    );
  }

  return data as T;
}

export type SseEvent = Record<string, unknown>;

export async function* streamSse(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const init: RequestInit = {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  };
  const headers = defaultHeaders(init);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
    throw new ApiError(
      messageFromFailedResponse(response.status, response.statusText, data),
      response.status,
      data,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const eventText of events) {
      const line = eventText.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(5).trim()) as SseEvent;
      } catch {
        /* skip malformed */
      }
    }
  }
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, form: FormData) => {
    const headers = new Headers();
    headers.set("X-User-ID", getUserId());
    return apiFetch<T>(path, { method: "POST", body: form, headers });
  },
  postBlob: async (path: string, body?: unknown): Promise<Blob> => {
    const init: RequestInit = {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    const headers = defaultHeaders(init);
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* ignore */
      }
      throw new ApiError(
        messageFromFailedResponse(response.status, response.statusText, data),
        response.status,
        data,
      );
    }
    return response.blob();
  },
};
