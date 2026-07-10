import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";

export interface ComfyInstanceStatus {
  address: string;
  online: boolean;
  latency_ms?: number;
  error?: string;
}

export interface ComfyuiStatusResponse {
  instances: ComfyInstanceStatus[];
  online_count: number;
  total: number;
}

const POLL_INTERVAL_MS = 12_000;

export function normalizeComfyAddress(addr: string): string {
  return addr.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function useComfyuiStatus(addresses: string[], enabled = true) {
  const cleaned = addresses.map(normalizeComfyAddress).filter(Boolean);
  const instancesKey = cleaned.join(",");

  return useQuery({
    queryKey: ["comfyui-status", instancesKey],
    queryFn: () => {
      const qs = instancesKey ? `?instances=${encodeURIComponent(instancesKey)}` : "";
      return api.get<ComfyuiStatusResponse>(`/api/comfyui/status${qs}`);
    },
    enabled: enabled && cleaned.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 8_000,
  });
}

export function comfyStatusLabel(online: boolean | undefined, fetching: boolean): string {
  if (fetching && online === undefined) return "检测中…";
  if (online === true) return "在线";
  if (online === false) return "离线";
  return "—";
}

export function comfyAggregateLabel(onlineCount: number, total: number, fetching: boolean): string {
  if (total <= 0) return "";
  if (fetching && onlineCount === 0) return "检测连接中…";
  if (onlineCount === total) return `全部在线（${total}）`;
  if (onlineCount === 0) return `全部离线（${total}）`;
  return `${onlineCount}/${total} 在线`;
}
