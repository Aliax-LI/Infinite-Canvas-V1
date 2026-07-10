import { api } from "../../../shared/api/client";

export interface GroupExportItem {
  kind: string;
  url: string;
  text?: string;
  name?: string;
}

export async function exportSmartCanvasGroup(payload: {
  folder?: string;
  group_name: string;
  items: GroupExportItem[];
}) {
  return api.post<{ ok?: boolean; path?: string }>(
    "/api/smart-canvas/group-export",
    payload,
  );
}

export async function uploadCloudVideo(file: File): Promise<{ url?: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/cloud-video/upload", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload failed");
  }
  return response.json() as Promise<{ url?: string }>;
}

export async function uploadRunningHubAsset(file: File): Promise<{ url?: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/runninghub/upload-asset", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload failed");
  }
  return response.json() as Promise<{ url?: string }>;
}
