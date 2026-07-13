import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, apiFetch } from "../../../shared/api/client";
import type {
  AssetLibraryCategory,
  AssetLibraryItem,
  AssetLibraryResponse,
} from "../../asset-manager/types";
import { ChevronRight, FolderPlus, Pencil, Trash2 } from "lucide-react";

const LOCAL_LIBRARY_ID = "__local_assets__";
const SMART_IMAGE_MIME = "application/x-smart-canvas-image";

interface AssetPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onToast?: (message: string) => void;
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

function collectFolderPaths(node: LocalTreeNode | undefined, acc: string[] = []): string[] {
  if (!node) return acc;
  if (node.path != null) acc.push(node.path);
  for (const child of node.children ?? []) collectFolderPaths(child, acc);
  return acc;
}

function imageCategories(cats: AssetLibraryCategory[] | undefined) {
  return (cats ?? []).filter((c) => c.type !== "workflow");
}

export function AssetPanel({ open, onClose, onSelect, onToast }: AssetPanelProps) {
  const { t } = useTranslation("smart-canvas");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"image" | "workflow">("image");
  const [libraryId, setLibraryId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [folder, setFolder] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [panelError, setPanelError] = useState("");

  const { data: libraryData } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
    enabled: open,
  });

  const { data: localData, refetch: refetchLocal } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () => api.get<LocalAssetsResponse>("/api/local-assets"),
    enabled: open,
  });

  const libraries = useMemo(() => {
    const lib = libraryData?.library;
    const remote = lib?.libraries?.length
      ? lib.libraries
      : lib?.categories
        ? [{ id: "default", name: "默认资产库", categories: lib.categories }]
        : [];
    return [
      ...remote.map((item) => ({
        id: item.id,
        name: item.name || item.id,
        categories: item.categories ?? [],
      })),
      { id: LOCAL_LIBRARY_ID, name: "本地素材", categories: [] as AssetLibraryCategory[] },
    ];
  }, [libraryData]);

  const activeLibraryId =
    libraryId && libraries.some((l) => l.id === libraryId)
      ? libraryId
      : libraries[0]?.id ?? LOCAL_LIBRARY_ID;
  const isLocal = activeLibraryId === LOCAL_LIBRARY_ID;
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? libraries[0];
  const cats = imageCategories(activeLibrary?.categories);

  const activeCategoryId =
    categoryId && cats.some((c) => c.id === categoryId) ? categoryId : cats[0]?.id ?? "";

  const folderOptions = useMemo(() => {
    const paths = collectFolderPaths(localData?.tree);
    return ["", ...paths.filter(Boolean)];
  }, [localData?.tree]);

  const imageItems = useMemo(() => {
    if (isLocal) {
      const all = localData?.items ?? [];
      if (!folder) return all.filter((item) => item.url);
      const prefix = `${folder}/`;
      return all.filter((item) => {
        const file = String(item.file ?? "");
        return item.url && (file.startsWith(prefix) || file === folder);
      });
    }
    const cat = cats.find((c) => c.id === activeCategoryId);
    return (cat?.items ?? []).filter((item): item is AssetLibraryItem & { url: string } =>
      Boolean(item.url),
    );
  }, [isLocal, localData?.items, folder, cats, activeCategoryId]);

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["asset-library"] });
    await queryClient.invalidateQueries({ queryKey: ["local-assets"] });
    await refetchLocal();
  }, [queryClient, refetchLocal]);

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      if (isLocal) {
        return api.post("/api/local-assets/folders", { name, parent: folder });
      }
      return api.post("/api/asset-library/categories", {
        name,
        library_id: activeLibraryId,
        type: "image",
      });
    },
    onSuccess: async () => {
      setPanelError("");
      await invalidateAll();
      onToast?.(t("assetSaved", { defaultValue: "已保存到资产库" }));
    },
    onError: (err: Error) => setPanelError(err.message || t("assetAddFail")),
  });

  const renameFolder = useMutation({
    mutationFn: async (name: string) => {
      if (isLocal) {
        if (!folder) throw new Error(t("assetNoFolder"));
        return apiFetch("/api/local-assets/folders", {
          method: "PATCH",
          body: JSON.stringify({ path: folder, name }),
        });
      }
      if (!activeCategoryId) throw new Error(t("assetNoFolder"));
      return apiFetch(`/api/asset-library/categories/${encodeURIComponent(activeCategoryId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          library_id: activeLibraryId,
        }),
      });
    },
    onSuccess: async () => {
      setPanelError("");
      await invalidateAll();
    },
    onError: (err: Error) => setPanelError(err.message || t("assetAddFail")),
  });

  const deleteItems = useMutation({
    mutationFn: (names: string[]) => api.post("/api/local-assets/delete", { names }),
    onSuccess: async () => {
      setPanelError("");
      await invalidateAll();
    },
    onError: (err: Error) => setPanelError(err.message || "删除失败"),
  });

  const saveUrl = useCallback(
    async (url: string, name = "") => {
      if (isLocal) {
        await api.post("/api/local-assets/import-urls", {
          folder,
          items: [{ url, name }],
        });
      } else {
        if (!activeCategoryId) throw new Error(t("assetNoFolder"));
        await api.post("/api/asset-library/items/batch", {
          category_id: activeCategoryId,
          library_id: activeLibraryId,
          items: [{ url, name }],
        });
      }
      await invalidateAll();
      onToast?.(t("assetSaved"));
    },
    [isLocal, folder, activeCategoryId, activeLibraryId, invalidateAll, onToast, t],
  );

  const saveFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (isLocal) {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        if (folder) form.append("folder", folder);
        await api.upload("/api/local-assets/upload", form);
      } else {
        if (!activeCategoryId) throw new Error(t("assetNoFolder"));
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        const uploaded = await api.upload<{ files?: Array<{ url?: string; name?: string }> }>(
          "/api/ai/upload",
          form,
        );
        const items = (uploaded.files ?? [])
          .filter((f) => f.url)
          .map((f) => ({ url: f.url!, name: f.name || "" }));
        if (!items.length) throw new Error(t("assetAddFail"));
        await api.post("/api/asset-library/items/batch", {
          category_id: activeCategoryId,
          library_id: activeLibraryId,
          items,
        });
      }
      await invalidateAll();
      onToast?.(t("assetSaved"));
    },
    [isLocal, folder, activeCategoryId, activeLibraryId, invalidateAll, onToast, t],
  );

  const hasCanvasImageDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes(SMART_IMAGE_MIME);

  const handleDragOver = (e: React.DragEvent) => {
    if (
      hasCanvasImageDrag(e) ||
      Array.from(e.dataTransfer.types).includes("Files") ||
      Array.from(e.dataTransfer.types).includes("text/uri-list")
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setPanelError("");
    try {
      const raw = e.dataTransfer.getData(SMART_IMAGE_MIME);
      if (raw) {
        const payload = JSON.parse(raw) as { url?: string; name?: string };
        if (payload?.url) {
          await saveUrl(payload.url, payload.name || "");
          return;
        }
      }
      const files = Array.from(e.dataTransfer.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        await saveFiles(files);
        return;
      }
      const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri?.startsWith("http")) {
        await saveUrl(uri.trim());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("assetAddFail");
      setPanelError(msg);
      onToast?.(msg);
    }
  };

  const promptName = (title: string, initial: string) => {
    const name = window.prompt(title, initial)?.trim();
    return name || "";
  };

  if (!open) return null;

  return (
    <aside
      className={`absolute right-[22px] top-[66px] bottom-[168px] z-[55] flex w-[300px] max-w-[calc(100vw-44px)] flex-col gap-2.5 overflow-hidden border border-[var(--border)] bg-[var(--bg)]/95 p-3 shadow-[0_22px_58px_var(--shadow)] backdrop-blur-xl ${
        dragOver ? "border-[var(--text)] shadow-[0_24px_64px_var(--shadow)]" : ""
      }`}
      data-testid="asset-panel"
      onPointerDown={(e) => e.stopPropagation()}
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {t("assetLibrary")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起"
          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text)]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <div className="flex border-b border-[var(--border)]">
        <button
          type="button"
          className={`flex-1 py-2 text-sm ${
            tab === "image" ? "border-b-2 border-black font-medium" : "text-[var(--muted)]"
          }`}
          onClick={() => setTab("image")}
          data-testid="asset-tab-library"
        >
          {t("assetImages")}
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-sm ${
            tab === "workflow" ? "border-b-2 border-black font-medium" : "text-[var(--muted)]"
          }`}
          onClick={() => setTab("workflow")}
          data-testid="asset-tab-workflow"
        >
          {t("assetWorkflows")}
        </button>
      </div>

      {tab === "workflow" ? (
        <p className="p-4 text-sm text-[var(--muted)]" data-testid="asset-workflow-empty">
          {t("assetWorkflowEmpty")}
        </p>
      ) : (
        <>
          <div className="space-y-2" data-testid="asset-image-controls">
            <select
              value={activeLibraryId}
              onChange={(e) => {
                setLibraryId(e.target.value);
                setCategoryId("");
                setFolder("");
              }}
              className="w-full border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              data-testid="asset-library-select"
              title="选择资产库"
            >
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>

            {isLocal ? (
              <div className="flex gap-1">
                <select
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                  data-testid="local-folder-select"
                >
                  <option value="">全部上传</option>
                  {folderOptions.filter(Boolean).map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="border border-[var(--border)] p-2"
                  title={t("assetNewFolder")}
                  data-testid="local-folder-create"
                  onClick={() => {
                    const name = promptName(t("assetNewFolder"), t("assetFolder"));
                    if (name) createFolder.mutate(name);
                  }}
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="border border-[var(--border)] p-2 disabled:opacity-40"
                  title={t("assetRenameFolder")}
                  disabled={!folder}
                  data-testid="local-folder-rename"
                  onClick={() => {
                    const name = promptName(t("assetRenameFolder"), folder.split("/").pop() || "");
                    if (name) renameFolder.mutate(name);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <select
                  value={activeCategoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                  data-testid="asset-category-select"
                >
                  {cats.length === 0 ? (
                    <option value="">暂无文件夹</option>
                  ) : (
                    cats.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name || cat.id}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="border border-[var(--border)] p-2"
                  title={t("assetNewFolder")}
                  data-testid="asset-folder-create"
                  onClick={() => {
                    const name = promptName(t("assetNewFolder"), t("assetFolder"));
                    if (name) createFolder.mutate(name);
                  }}
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="border border-[var(--border)] p-2 disabled:opacity-40"
                  title={t("assetRenameFolder")}
                  disabled={!activeCategoryId}
                  data-testid="asset-folder-rename"
                  onClick={() => {
                    const current = cats.find((c) => c.id === activeCategoryId)?.name || "";
                    const name = promptName(t("assetRenameFolder"), current);
                    if (name) renameFolder.mutate(name);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div
            className={`flex min-h-[58px] items-center justify-center border border-dashed px-2 py-2 text-center text-[10.5px] font-semibold leading-snug text-[var(--muted)] transition-colors ${
              dragOver
                ? "border-[var(--text)] bg-[var(--card,var(--bg))] text-[var(--text)]"
                : "border-[var(--border)] bg-[var(--soft,var(--nav-hover-bg))]"
            }`}
            data-testid="asset-drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => void handleDrop(e)}
          >
            {t("assetDropHint")}
          </div>

          {panelError ? (
            <p className="text-xs text-red-500" data-testid="asset-panel-error">
              {panelError}
            </p>
          ) : null}

          <div className="studio-history-masonry min-h-0 flex-1 overflow-auto">
            {imageItems.length === 0 ? (
              <p className="col-span-2 p-4 text-sm text-[var(--muted)]">{t("assetEmpty")}</p>
            ) : (
              imageItems.map((item) => (
                <div key={item.url} className="relative group">
                  <button
                    type="button"
                    onClick={() => onSelect(item.url!)}
                    className="studio-history-item studio-history-item-trigger w-full overflow-hidden border border-[var(--border)] hover:border-black/30"
                  >
                    <img
                      src={item.url}
                      alt={item.name ?? ""}
                      className="h-auto w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                  {isLocal && "file" in item && item.file ? (
                    <button
                      type="button"
                      className="absolute right-1 top-1 bg-black/70 p-1 text-white opacity-0 group-hover:opacity-100"
                      title="删除"
                      data-testid="local-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`${t("assetDeleteConfirm")}`)) {
                          deleteItems.mutate([String(item.file)]);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
}

/** @deprecated kept for tests that may import the local tab id */
export const ASSET_PANEL_LOCAL_ID = LOCAL_LIBRARY_ID;
