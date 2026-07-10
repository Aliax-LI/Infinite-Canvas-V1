export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

/** Extract credit / balance fields from Jimeng CLI JSON (matches legacy jimengCreditText). */
export function formatJimengCredit(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const parts: string[] = [];
  const seen = new Set<string>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const low = key.toLowerCase();
      if (/credit|balance|quota|point|coin|积分|余额/.test(low) && item !== null && typeof item !== "object") {
        const label = `${key}: ${item}`;
        if (!seen.has(label)) {
          seen.add(label);
          parts.push(label);
        }
      }
      if (item && typeof item === "object") visit(item);
    });
  };

  visit(raw);
  return parts.join(" · ") || prettyJson(raw);
}

export function formatCliActionMessage(res: unknown): string {
  if (typeof res === "string") return res;
  if (!res || typeof res !== "object") return String(res ?? "");
  const obj = res as Record<string, unknown>;
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
  if (typeof obj.text === "string" && obj.text.trim()) return obj.text;
  if (typeof obj.output === "string" && obj.output.trim()) return obj.output;
  if (obj.raw) return formatJimengCredit(obj.raw) || prettyJson(obj.raw);
  return prettyJson(res);
}
