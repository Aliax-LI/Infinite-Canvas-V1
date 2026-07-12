export const MAX_ONLINE_REFS = 3;

export const STUDIO_IMAGE_URL_MIME = "application/x-studio-image-url";

export type OnlineRefFile = {
  id: string;
  /** Preview or persisted URL shown in thumbnails. */
  url: string;
  /** Server URL after upload; omitted for archive URLs that are already persisted. */
  serverUrl?: string;
  name?: string;
  mime?: string;
  uploading?: boolean;
};

export function createRefId(): string {
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function refPayloadUrl(ref: OnlineRefFile): string | null {
  const url = (ref.serverUrl || ref.url || "").trim();
  return url || null;
}

export function toReferencePayload(refs: OnlineRefFile[]): Array<{ url: string; name?: string; mime?: string }> {
  return refs
    .filter((ref) => !ref.uploading)
    .map((ref) => {
      const url = refPayloadUrl(ref);
      if (!url) return null;
      const item: { url: string; name?: string; mime?: string } = { url };
      if (ref.name) item.name = ref.name;
      if (ref.mime) item.mime = ref.mime;
      return item;
    })
    .filter((item): item is { url: string; name?: string; mime?: string } => Boolean(item));
}

export function mergeRefs(
  prev: OnlineRefFile[],
  incoming: OnlineRefFile[],
  max = MAX_ONLINE_REFS,
): OnlineRefFile[] {
  const next = [...prev];
  for (const ref of incoming) {
    if (next.length >= max) break;
    const url = refPayloadUrl(ref);
    if (url && next.some((item) => refPayloadUrl(item) === url)) continue;
    next.push(ref);
  }
  return next.slice(0, max);
}

export function isStudioImageUrl(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (text.startsWith("/assets/") || text.startsWith("/output/")) return true;
  if (text.startsWith("blob:") || text.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function readDroppedImageUrl(dataTransfer: DataTransfer): string | null {
  const custom = dataTransfer.getData(STUDIO_IMAGE_URL_MIME).trim();
  if (custom && isStudioImageUrl(custom)) return custom;
  const plain = dataTransfer.getData("text/plain").trim();
  if (plain && isStudioImageUrl(plain)) return plain;
  const uri = dataTransfer.getData("text/uri-list").trim().split("\n")[0]?.trim();
  if (uri && isStudioImageUrl(uri)) return uri;
  return null;
}
