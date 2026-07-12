import { api } from "../../../shared/api/client";

const CLIENT_ID_KEY = "client_id";

export function getToolClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "anonymous-client";
  }
}

export interface ComfyUploadFile {
  comfy_name: string;
}

export async function uploadToComfy(files: File[]): Promise<ComfyUploadFile[]> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const data = await api.upload<{ files: ComfyUploadFile[] }>("/api/upload", form);
  return data.files ?? [];
}

export interface GeneratePayload {
  prompt?: string;
  workflow_json?: string;
  params?: Record<string, Record<string, unknown>>;
  type: string;
  width?: number;
  height?: number;
  client_id?: string;
}

export interface GenerateResult {
  images?: string[];
  url?: string;
  error?: string;
  timestamp?: number;
  prompt?: string;
}

export async function comfyGenerate(payload: GeneratePayload): Promise<GenerateResult> {
  const result = await api.post<GenerateResult>("/api/generate", {
    client_id: getToolClientId(),
    ...payload,
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

export async function fetchModelScopeToken(): Promise<string> {
  try {
    const data = await api.get<{ token?: string }>("/api/config/token");
    return data.token?.trim() ?? "";
  } catch {
    return "";
  }
}

export interface MsGeneratePayload {
  prompt: string;
  model?: string;
  image_urls?: string[];
  width?: number;
  height?: number;
  size?: string;
  loras?: Record<string, number>;
  client_id?: string;
}

export async function msGenerate(payload: MsGeneratePayload): Promise<{ url?: string }> {
  return api.post("/api/ms/generate", {
    client_id: getToolClientId(),
    ...payload,
  });
}

export interface AngleGeneratePayload {
  prompt: string;
  image_urls: string[];
  model?: string;
  api_key?: string;
  type?: string;
  client_id?: string;
}

export interface AngleGenerateResult {
  url?: string;
  status?: string;
  task_id?: string;
  message?: string;
}

export async function angleGenerate(
  payload: AngleGeneratePayload,
): Promise<AngleGenerateResult> {
  return api.post("/api/angle/generate", {
    client_id: getToolClientId(),
    type: "angle",
    model: "Qwen/Qwen-Image-Edit-2511",
    ...payload,
  });
}

export async function anglePollStatus(
  taskId: string,
  apiKey?: string,
): Promise<AngleGenerateResult> {
  return api.post("/api/angle/poll_status", {
    task_id: taskId,
    api_key: apiKey ?? "",
    client_id: getToolClientId(),
  });
}

export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function firstImageUrl(result: GenerateResult | { url?: string; images?: string[] }): string | null {
  return result.url ?? result.images?.[0] ?? null;
}

/** All image URLs from a generate result (preserves backend order: finals first). */
export function allImageUrls(result: GenerateResult | { url?: string; images?: string[] }): string[] {
  if (Array.isArray(result.images) && result.images.length > 0) {
    return result.images.filter(Boolean);
  }
  return result.url ? [result.url] : [];
}

export async function blobUrlFromImage(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  return response.blob();
}

export interface UpscaleAvailability {
  upscale_available: boolean;
  reason?: string;
}

export interface WorkflowAvailability {
  workflow?: string;
  available: boolean;
  missing_nodes?: string[];
  missing_models?: string[];
  reason?: string;
}

export async function fetchUpscaleAvailability(): Promise<UpscaleAvailability> {
  return api.get<UpscaleAvailability>("/api/comfyui/upscale-availability");
}

export async function fetchWorkflowAvailability(workflow: string): Promise<WorkflowAvailability> {
  return api.get<WorkflowAvailability>(
    `/api/comfyui/workflow-availability?workflow=${encodeURIComponent(workflow)}`,
  );
}

export function workflowDownloadUrl(workflow: string): string {
  return `/api/workflows/${encodeURIComponent(workflow)}/download`;
}

export async function downloadWorkflowJson(workflow: string): Promise<void> {
  const url = workflowDownloadUrl(workflow);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download workflow: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = workflow.split("/").pop() || "workflow.json";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
