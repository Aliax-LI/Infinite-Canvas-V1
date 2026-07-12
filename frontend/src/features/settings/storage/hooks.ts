import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStorageBackup,
  fetchStorageBackups,
  fetchStorageHealth,
  fetchStorageStats,
  restoreStorageBackup,
} from "./storageApi";

export function useStorageStats() {
  return useQuery({
    queryKey: ["storage-stats"],
    queryFn: fetchStorageStats,
    staleTime: 30_000,
  });
}

export function useStorageHealth() {
  return useQuery({
    queryKey: ["storage-health"],
    queryFn: fetchStorageHealth,
    staleTime: 30_000,
  });
}

export function useStorageBackups() {
  return useQuery({
    queryKey: ["storage-backups"],
    queryFn: fetchStorageBackups,
    staleTime: 15_000,
  });
}

export function useCreateStorageBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStorageBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-backups"] });
      queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
    },
  });
}

export function useRestoreStorageBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupDir: string) => restoreStorageBackup(backupDir),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
      queryClient.invalidateQueries({ queryKey: ["storage-health"] });
      queryClient.invalidateQueries({ queryKey: ["storage-backups"] });
    },
  });
}
