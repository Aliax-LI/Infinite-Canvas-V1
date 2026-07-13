import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import type {
  AssetLibraryCategory,
  AssetLibraryItem,
  AssetLibraryResponse,
} from "../../asset-manager/types";
import { ChevronRight, FolderPlus } from "lucide-react";

const LOCAL_LIBRARY_ID = "__local_assets__";

interface LegacyAssetPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onToast?: (message: string) => void;
}

interface LocalTreeNode {
  path?: string;
  name?: string;
  children?: LocalTreeNode[];
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

export function LegacyAssetPanel({
  open,
  onClose,
  onSelect,
  onToast,
}: LegacyAssetPanelProps) {
  const { t } = useTranslation("canvas");
  const queryClient = useQueryClient();
  const [libraryId, setLibraryId] = useState("");
  const [categoryId, setCategoryId] = useState("");
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

  const items = useMemo(() => {
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
    },
    onError: (err: Error) => setPanelError(err.message || "创建失败"),
  });

  const saveUrl = useCallback(
    async (url: string, name = "") => {
      if (isLocal) {
        await api.post("/api/local-assets/import-urls", {
          folder,
          items: [{ url, name }],
        });
      } else {
        if (!activeCategoryId) throw new Error("请先选择分组");
        await api.post("/api/asset-library/items/batch", {
          category_id: activeCategoryId,
          library_id: activeLibraryId,
          items: [{ url, name }],
        });
      }
      await invalidateAll();
      onToast?.("已保存到资产库");
    },
    [isLocal, folder, activeCategoryId, activeLibraryId, invalidateAll, onToast],
  );

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setPanelError("");
    try {
      const files = Array.from(e.dataTransfer.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        if (isLocal) {
          const form = new FormData();
          files.forEach((f) => form.append("files", f));
          if (folder) form.append("folder", folder);
          await api.upload("/api/local-assets/upload", form);
        } else {
          if (!activeCategoryId) throw new Error("请先选择分组");
          const form = new FormData();
          files.forEach((f) => form.append("files", f));
          const uploaded = await api.upload<{ files?: Array<{ url?: string; name?: string }> }>(
            "/api/ai/upload",
            form,
          );
          const batch = (uploaded.files ?? [])
            .filter((f) => f.url)
            .map((f) => ({ url: f.url!, name: f.name || "" }));
          if (!batch.length) throw new Error("上传失败");
          await api.post("/api/asset-library/items/batch", {
            category_id: activeCategoryId,
            library_id: activeLibraryId,
            items: batch,
          });
        }
        await invalidateAll();
        onToast?.("已保存到资产库");
        return;
      }
      const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri?.startsWith("http") || uri?.startsWith("/")) {
        await saveUrl(uri.trim());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存资产失败";
      setPanelError(msg);
      onToast?.(msg);
    }
  };

  if (!open) return null;

  return (
    <aside
      className={`absolute right-[22px] top-[66px] bottom-[168px] z-[55] flex w-[300px] max-w-[calc(100vw-44px)] flex-col gap-2.5 overflow-hidden border border-[var(--border)] bg-[var(--bg)]/95 p-3 shadow-[0_22px_58px_var(--shadow)] backdrop-blur-xl ${
        dragOver ? "border-[var(--text)]" : ""
      }`}
      data-testid="legacy-asset-panel"
      onPointerDown={(e) => e.stopPropagation()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("assetLibrary")}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--nav-hover-bg)]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <select
        value={activeLibraryId}
        onChange={(e) => {
          setLibraryId(e.target.value);
          setCategoryId("");
          setFolder("");
        }}
        className="w-full border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        data-testid="legacy-asset-library-select"
      >
        {libraries.map((lib) => (
          <option key={lib.id} value={lib.id}>
            {lib.name}
          </option>
        ))}
      </select>

      <div className="flex gap-1">
        {isLocal ? (
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            data-testid="legacy-asset-folder-select"
          >
            <option value="">全部上传</option>
            {folderOptions.filter(Boolean).map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={activeCategoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            data-testid="legacy-asset-category-select"
          >
            {cats.length === 0 ? (
              <option value="">暂无分组</option>
            ) : (
              cats.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name || cat.id}
                </option>
              ))
            )}
          </select>
        )}
        <button
          type="button"
          className="border border-[var(--border)] p-2"
          title="新建分组"
          data-testid="legacy-asset-add-category"
          onClick={() => {
            const name = window.prompt("新建分组", "新分组")?.trim();
            if (name) createFolder.mutate(name);
          }}
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>

      <div
        className={`flex min-h-[58px] items-center justify-center border border-dashed px-2 py-2 text-center text-[10.5px] font-semibold text-[var(--muted)] ${
          dragOver ? "border-[var(--text)] text-[var(--text)]" : "border-[var(--border)]"
        }`}
        data-testid="legacy-asset-drop-zone"
      >
        拖入图片或输出保存到当前分组
      </div>

      {panelError ? <p className="text-xs text-red-500">{panelError}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-2 gap-2 content-start">
          {items.length === 0 ? (
            <p className="col-span-2 p-4 text-sm text-[var(--muted)]">当前分组还没有素材</p>
          ) : (
            items.map((item) => (
              <button
                key={item.url}
                type="button"
                onClick={() => onSelect(item.url!)}
                className="overflow-hidden border border-[var(--border)] hover:border-black"
              >
                <img
                  src={item.url}
                  alt={item.name ?? ""}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

