import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import { fetchCheckUpdate, type CheckUpdateView } from "../../shared/api/checkUpdate";
import type { AppInfo } from "../../types/api";

export function useAppInfo() {
  return useQuery({
    queryKey: ["app-info"],
    queryFn: () => api.get<AppInfo>("/api/app-info"),
    staleTime: 60_000,
  });
}

export function useCheckUpdate() {
  return useQuery<CheckUpdateView>({
    queryKey: ["check-update"],
    queryFn: () => fetchCheckUpdate(api.get),
    staleTime: 300_000,
    refetchInterval: 600_000,
  });
}
