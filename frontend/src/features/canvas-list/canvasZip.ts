/** Fork-first: history `canvas-list.js` ZIP helpers (client-side export). */

const ZIP_ENCODER = new TextEncoder();

let zipCrcTable: Uint32Array | null = null;

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function zipCrc32(bytes: Uint8Array): number {
  if (!zipCrcTable) zipCrcTable = buildCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = zipCrcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isCanvasResourceUrl(url: string): boolean {
  return (
    url.startsWith("/assets/") ||
    url.startsWith("/output/") ||
    /^https?:\/\//i.test(url)
  );
}

export function collectCanvasResourceUrls(
  value: unknown,
  out: string[] = [],
  seen = new Set<string>(),
): string[] {
  if (value == null) return out;
  if (typeof value === "string") {
    const text = value.trim();
    if (isCanvasResourceUrl(text) && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectCanvasResourceUrls(item, out, seen));
    return out;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectCanvasResourceUrls(item, out, seen),
    );
  }
  return out;
}

export function exportResourceName(
  url: string,
  index: number,
  used: Set<string>,
): string {
  let name = "";
  try {
    const parsed = new URL(url, window.location.origin);
    name = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).pop() || "",
    );
  } catch {
    name = String(url || "")
      .split(/[?#]/)[0]
      .split("/")
      .pop() || "";
  }
  name =
    safeExportBase(name || `resource-${String(index + 1).padStart(3, "0")}`, `resource-${index + 1}`);
  if (!/\.[a-z0-9]{1,8}$/i.test(name)) name += ".bin";
  let finalName = `resources/${name}`;
  const dot = finalName.lastIndexOf(".");
  const stem = dot > 0 ? finalName.slice(0, dot) : finalName;
  const ext = dot > 0 ? finalName.slice(dot) : "";
  let suffix = 2;
  while (used.has(finalName)) {
    finalName = `${stem}-${suffix}${ext}`;
    suffix++;
  }
  used.add(finalName);
  return finalName;
}

export function safeExportBase(name: string, fallback = "canvas"): string {
  return (
    String(name || fallback)
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim()
      .slice(0, 60) || fallback
  );
}

async function fetchResourceBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export function createZipBlob(entries: ZipEntry[]): Blob {
  const files: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = ZIP_ENCODER.encode(entry.name);
    const crc = zipCrc32(entry.bytes);
    const local = new Uint8Array(30 + nameBytes.length + entry.bytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.bytes.length, true);
    view.setUint32(22, entry.bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(entry.bytes, 30 + nameBytes.length);
    files.push(local);

    const centralHdr = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHdr.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(8, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.bytes.length, true);
    cv.setUint32(24, entry.bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHdr.set(nameBytes, 46);
    central.push(centralHdr);
    offset += local.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...files, ...central, end], { type: "application/zip" });
}

export async function buildCanvasAssetsZip(
  canvasId: string,
  canvasDoc: unknown,
  title?: string,
): Promise<{ blob: Blob; included: number; skipped: number }> {
  const base = safeExportBase(title || "canvas");
  const urls = collectCanvasResourceUrls(canvasDoc).slice(0, 1000);
  const usedNames = new Set(["canvas.json", "resources-manifest.json"]);
  const entries: ZipEntry[] = [
    {
      name: "canvas.json",
      bytes: ZIP_ENCODER.encode(JSON.stringify(canvasDoc, null, 2)),
    },
  ];
  const manifest: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const bytes = await fetchResourceBytes(url);
      const name = exportResourceName(url, i, usedNames);
      entries.push({ name, bytes });
      manifest.push({ url, file: name, size: bytes.length });
    } catch (e) {
      skipped++;
      manifest.push({
        url,
        skipped: true,
        reason: String(e instanceof Error ? e.message : e || "fetch failed").slice(
          0,
          120,
        ),
      });
    }
  }

  entries.push({
    name: "resources-manifest.json",
    bytes: ZIP_ENCODER.encode(
      JSON.stringify({ canvas_id: canvasId, resources: manifest }, null, 2),
    ),
  });

  return {
    blob: createZipBlob(entries),
    included: Math.max(0, entries.length - 2),
    skipped,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}
