export function formatApiDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed || null;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          const record = item as { msg?: unknown; message?: unknown; loc?: unknown };
          const msg = record.msg ?? record.message;
          if (typeof msg === "string" && msg.trim()) {
            const loc = Array.isArray(record.loc) ? record.loc.join(".") : "";
            return loc ? `${loc}: ${msg}` : msg;
          }
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return parts.length ? parts.join("；") : null;
  }
  if (typeof detail === "object" && detail !== null) {
    const record = detail as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }
  return null;
}

export function statusFallbackMessage(status: number, fallback: string): string {
  if (status === 404) return "接口不存在，请确认后端服务已启动。";
  if (status === 401 || status === 403) return "请求未授权，请检查 API Key 或登录状态。";
  if (status === 422) return "请求参数无效，请确认已选择文件且上传格式正确。";
  if (status === 429) return "请求过于频繁，请稍后再试。";
  if (status >= 500) return "服务暂时不可用，请稍后再试。";
  return fallback;
}

/** Normalize upstream disconnect / timeout strings for Chinese UI. */
export function normalizeGenerationError(message: string): string {
  const text = String(message ?? "").trim();
  if (!text) return "";
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
  return text;
}

export function formatApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "status" in err && "body" in err) {
    const apiErr = err as { status: number; message?: string; body: unknown };
    const fromBody =
      typeof apiErr.body === "object" && apiErr.body !== null && "detail" in apiErr.body
        ? formatApiDetail((apiErr.body as { detail: unknown }).detail)
        : null;
    if (fromBody) return normalizeGenerationError(fromBody);
    if (apiErr.message && apiErr.message !== "Not Found" && apiErr.message !== "Request failed") {
      return normalizeGenerationError(apiErr.message);
    }
    return statusFallbackMessage(apiErr.status, fallback);
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
