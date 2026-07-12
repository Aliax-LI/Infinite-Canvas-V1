/** Fetch image as blob and trigger a local download (works for `/assets/...` same-origin URLs). */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const clean = url.split("?")[0];
  const ext = clean.includes(".") ? clean.split(".").pop() : "png";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || `image-${Date.now()}.${ext || "png"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
