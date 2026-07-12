import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import type { AssetLibraryResponse } from "../../asset-manager/types";
import { FolderPlus, Trash2, Upload, X } from "lucide-react";

interface AssetPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

interface LocalTreeNode {
  path?: string;
  name?: string;
  count?: number;
  children?: LocalTreeNode[];
  items?: Array<{ url?: string; name?: string; file?: string }>;
}

interface LocalAssetsResponse {
  items?: Array<{ url?: string; name?: string; file?: string }>;
  tree?: LocalTreeNode;
}

function flattenLibraryImages(data: AssetLibraryResponse | undefined) {
  const lib = data?.library;
  if (!lib) return [];
  const activeId = lib.active_library_id ?? lib.libraries?.[0]?.id ?? "";
  const active =
    lib.libraries?.find((item) => item.id === activeId) ?? lib.libraries?.[0];
  const categories = active?.categories ?? lib.categories ?? [];
  return categories
    .filter((c) => c.type !== "workflow")
    .flatMap((c) => c.items ?? [])
    .filter((item) => item.url);
}

function collectFolderPaths(node: LocalTreeNode | undefined, acc: string[] = []): string[] {
  if (!node) return acc;
  if (node.path != null) acc.push(node.path);
  for (const child of node.children ?? []) collectFolderPaths(child, acc);
  return acc;
}

export function AssetPanel({ open, onClose, onSelect }: AssetPanelProps) {
  const { t } = useTranslation("assets");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"library" | "local">("library");
  const [folder, setFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [panelError, setPanelError] = useState("");

  const { data: libraryData } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
    enabled: open && tab === "library",
  });

  const { data: localData, refetch: refetchLocal } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () => api.get<LocalAssetsResponse>("/api/local-assets"),
    enabled: open,
  });

  const invalidateLocal = async () => {
    await queryClient.invalidateQueries({ queryKey: ["local-assets"] });
    await refetchLocal();
  };

  const createFolder = useMutation({
    mutationFn: (name: string) =>
      api.post("/api/local-assets/folders", { name, parent: folder }),
    onSuccess: async () => {
      setNewFolderName("");
      setPanelError("");
      await invalidateLocal();
    },
    onError: (err: Error) => setPanelError(err.message || "创建文件夹失败"),
  });

  const deleteItems = useMutation({
    mutationFn: (names: string[]) =>
      api.post("/api/local-assets/delete", { names }),
    onSuccess: async () => {
      setPanelError("");
      await invalidateLocal();
    },
    onError: (err: Error) => setPanelError(err.message || "删除失败"),
  });

  const uploadLocal = useMutation({
    mutationFn: async (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      if (folder) form.append("folder", folder);
      return api.upload<{ files?: Array<{ url?: string }> }>("/api/local-assets/upload", form);
    },
    onSuccess: async () => {
      setPanelError("");
      await invalidateLocal();
    },
    onError: (err: Error) => setPanelError(err.message || "上传失败"),
  });

  const libraryItems = useMemo(() => flattenLibraryImages(libraryData), [libraryData]);

  const folderOptions = useMemo(() => {
    const paths = collectFolderPaths(localData?.tree);
    return ["", ...paths.filter((p) => p)];
  }, [localData?.tree]);

  const localItems = useMemo(() => {
    const all = localData?.items ?? [];
    if (!folder) return all.filter((item) => item.url);
    const prefix = `${folder}/`;
    return all.filter((item) => {
      const file = String(item.file ?? "");
      return item.url && (file.startsWith(prefix) || file === folder);
    });
  }, [localData?.items, folder]);

  const items = tab === "library" ? libraryItems : localItems;

  if (!open) return null;

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 w-80 border-l border-[var(--border)] bg-[var(--bg)] z-20 flex flex-col"
      data-testid="asset-panel"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="font-medium text-sm">{t("title")}</h3>
        <button type="button" onClick={onClose} aria-label="close">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex border-b border-[var(--border)]">
        <button
          type="button"
          className={`flex-1 py-2 text-sm ${tab === "library" ? "border-b-2 border-black font-medium" : "text-[var(--muted)]"}`}
          onClick={() => setTab("library")}
          data-testid="asset-tab-library"
        >
          素材库
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-sm ${tab === "local" ? "border-b-2 border-black font-medium" : "text-[var(--muted)]"}`}
          onClick={() => setTab("local")}
          data-testid="asset-tab-local"
        >
          本地文件夹
        </button>
      </div>
      {tab === "local" && (
        <div className="p-2 border-b border-[var(--border)] space-y-2" data-testid="local-folder-toolbar">
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="w-full border border-[var(--border)] px-2 py-1 text-sm"
            data-testid="local-folder-select"
          >
            <option value="">全部上传</option>
            {folderOptions
              .filter(Boolean)
              .map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
          </select>
          <div className="flex gap-1">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="新建文件夹名"
              className="flex-1 border border-[var(--border)] px-2 py-1 text-sm"
              data-testid="local-folder-name"
            />
            <button
              type="button"
              className="p-2 border border-[var(--border)]"
              title="新建文件夹"
              data-testid="local-folder-create"
              onClick={() => {
                const name = newFolderName.trim();
                if (!name) {
                  setPanelError("请输入文件夹名");
                  return;
                }
                createFolder.mutate(name);
              }}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <label className="p-2 border border-[var(--border)] cursor-pointer" title="上传到当前文件夹">
              <Upload className="w-4 h-4" />
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*"
                data-testid="local-folder-upload"
                onChange={(e) => {
                  if (e.target.files?.length) uploadLocal.mutate(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {panelError && (
            <p className="text-xs text-red-500" data-testid="local-folder-error">
              {panelError}
            </p>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2 studio-history-masonry">
        {items.length === 0 ? (
          <p className="col-span-2 text-sm text-[var(--muted)] p-4">{t("empty")}</p>
        ) : (
          items.map((item) => (
            <div key={item.url} className="relative group">
              <button
                type="button"
                onClick={() => onSelect(item.url!)}
                className="studio-history-item studio-history-item-trigger border border-[var(--border)] overflow-hidden hover:border-black/30 w-full"
              >
                <img
                  src={item.url}
                  alt={item.name ?? ""}
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </button>
              {tab === "local" && item.file && (
                <button
                  type="button"
                  className="absolute top-1 right-1 p-1 bg-black/70 text-white opacity-0 group-hover:opacity-100"
                  title="删除"
                  data-testid="local-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`删除 ${item.name || item.file}?`)) {
                      deleteItems.mutate([item.file!]);
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
