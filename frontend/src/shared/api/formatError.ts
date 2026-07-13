const ERROR_TEXT_MAX = 480;

/** Truncate long upstream bodies while keeping actionable head text. */
export function truncateErrorText(text: string, max = ERROR_TEXT_MAX): string {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function stringifyUnknownDetail(value: unknown): string | null {
  try {
    const raw = JSON.stringify(value);
    if (!raw || raw === "{}" || raw === "[]" || raw === "null") return null;
    return truncateErrorText(raw);
  } catch {
    return null;
  }
}

export function formatApiDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed ? truncateErrorText(trimmed) : null;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          const record = item as {
            msg?: unknown;
            message?: unknown;
            loc?: unknown;
          };
          const msg = record.msg ?? record.message;
          if (typeof msg === "string" && msg.trim()) {
            const loc = Array.isArray(record.loc) ? record.loc.join(".") : "";
            return loc ? `${loc}: ${msg}` : msg;
          }
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return parts.length ? truncateErrorText(parts.join("；")) : null;
  }
  if (typeof detail === "object" && detail !== null) {
    const record = detail as {
      message?: unknown;
      msg?: unknown;
      error?: unknown;
      detail?: unknown;
      error_info?: unknown;
    };
    for (const key of ["message", "msg", "error", "error_info", "detail"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return truncateErrorText(value);
      }
      if (value && typeof value === "object") {
        const nested = formatApiDetail(value);
        if (nested) return nested;
      }
    }
    return stringifyUnknownDetail(detail);
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  return null;
}

export function statusFallbackMessage(status: number, fallback: string): string {
  if (status === 404) return "接口不存在，请确认后端服务已启动。";
  if (status === 401 || status === 403) return "请求未授权，请检查 API Key 或登录状态。";
  if (status === 422) return "请求参数无效，请确认已选择文件且上传格式正确。";
  if (status === 429) return "请求过于频繁，请稍后再试。";
  if (status >= 500) return `服务暂时不可用（HTTP ${status}），请稍后再试。`;
  return fallback;
}

/** Normalize upstream disconnect / timeout strings for Chinese UI. */
export function normalizeGenerationError(message: string): string {
  const text = String(message ?? "").trim();
  if (!text) return "";

  const emptyHttp = text.match(/^HTTP Error (\d+):\s*$/i);
  if (emptyHttp) {
    return `上游返回 HTTP ${emptyHttp[1]}，未提供详细错误信息。请检查 ModelScope / ComfyUI 服务或稍后重试。`;
  }

  const lower = text.toLowerCase();
  if (lower.includes("server disconnected without sending a response")) {
    return "上游生图服务在返回结果前断开连接。常见于参考图较大或生成耗时较长，请稍后重试或降低分辨率。";
  }
  if (lower.includes("read timeout") || (lower.includes("timed out") && !text.includes("生成超时"))) {
    return "上游生图请求超时，请降低分辨率/张数或稍后重试。";
  }
  if (lower.includes("connection reset") || lower.includes("connection refused")) {
    return "与上游生图服务的连接被中断，请稍后重试。";
  }
  const prefix = "请求上游生图接口失败：";
  if (text.startsWith(prefix)) {
    const inner = text.slice(prefix.length).trim();
    const normalized = normalizeGenerationError(inner);
    return normalized !== inner ? normalized : text;
  }
  return truncateErrorText(text);
}

function extractMessageFromBody(body: unknown): string | null {
  if (typeof body === "string" && body.trim()) {
    return truncateErrorText(body);
  }
  if (typeof body !== "object" || body === null) return null;
  const record = body as {
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
  return stringifyUnknownDetail(body);
}

export function formatApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "status" in err && "body" in err) {
    const apiErr = err as { status: number; message?: string; body: unknown };
    const fromBody = extractMessageFromBody(apiErr.body);
    if (fromBody) return normalizeGenerationError(fromBody);
    if (
      apiErr.message &&
      apiErr.message.trim() &&
      apiErr.message !== "Not Found" &&
      apiErr.message !== "Request failed"
    ) {
      return normalizeGenerationError(apiErr.message);
    }
    return statusFallbackMessage(apiErr.status, fallback);
  }
  if (err instanceof Error && err.message.trim()) {
    return normalizeGenerationError(err.message);
  }
  return fallback;
}
