import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Upload } from "lucide-react";
import { api } from "../../shared/api/client";
import { AssetMasonry } from "../../shared/components/AssetMasonry";
import { Lightbox } from "../../shared/components/Lightbox";
import { UploadZone } from "../../shared/components/UploadZone";
import { cn } from "../../shared/utils";
import type {
  AssetLibraryCategory,
  AssetLibraryResponse,
  LocalAssetItem,
} from "./types";
import { AssetAnnotationToolbar } from "./AssetAnnotationToolbar";

type Tab = "images" | "workflows" | "prompts" | "canvas-assets" | "local-media";

function resolveActiveLibrary(data: AssetLibraryResponse | undefined) {
  const lib = data?.library;
  if (!lib) return { libraryId: "", categories: [] as AssetLibraryCategory[] };
  const activeId = lib.active_library_id ?? lib.libraries?.[0]?.id ?? "";
  const active =
    lib.libraries?.find((item) => item.id === activeId) ??
    lib.libraries?.[0] ??
    null;
  return {
    libraryId: active?.id ?? activeId,
    categories: active?.categories ?? lib.categories ?? [],
  };
}

function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((file) => dt.items.add(file));
  return dt.files;
}

export function AssetManagerPage() {
  const { t } = useTranslation("assets");
  const { t: tStudio } = useTranslation("studio");
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const workflowRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("images");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newPromptName, setNewPromptName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const { data: libraryData, isLoading: libraryLoading } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
  });

  const { libraryId, categories } = useMemo(
    () => resolveActiveLibrary(libraryData),
    [libraryData],
  );

  const imageCategories = useMemo(
    () => categories.filter((c) => c.type === "image" || !c.type),
    [categories],
  );

  const activeCategory = useMemo(() => {
    if (!categoryId) return null;
    return imageCategories.find((c) => c.id === categoryId) ?? null;
  }, [categoryId, imageCategories]);

  const { data: localAssets, isLoading: localLoading } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () =>
      api.get<{ items?: LocalAssetItem[] }>("/api/local-assets"),
    enabled: tab === "local-media" || tab === "images",
  });

  const { data: prompts } = useQuery({
    queryKey: ["prompt-libraries"],
    queryFn: () =>
      api.get<{ libraries?: Array<{ id: string; name?: string }> }>(
        "/api/prompt-libraries",
      ),
    enabled: tab === "prompts",
  });

  const { data: canvasAssets } = useQuery({
    queryKey: ["canvas-assets"],
    queryFn: () =>
      api.get<{ items?: Array<{ id: string; name?: string; title?: string; url?: string }> }>(
        "/api/canvas-assets",
      ),
    enabled: tab === "canvas-assets",
  });

  const invalidateLibrary = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["asset-library"] });
  }, [queryClient]);

  const addToLibrary = useCallback(
    async (uploaded: Array<{ url?: string; name?: string }>) => {
      const targetCat = activeCategory ?? imageCategories[0];
      if (!targetCat?.id || !uploaded.length) return;
      const items = uploaded
        .filter((f) => f.url)
        .map((f) => ({ url: f.url!, name: f.name ?? "" }));
      if (!items.length) return;
      await api.post("/api/asset-library/items/batch", {
        category_id: targetCat.id,
        library_id: libraryId,
        items,
      });
      await invalidateLibrary();
    },
    [activeCategory, imageCategories, invalidateLibrary, libraryId],
  );

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const result = await api.upload<{ files?: LocalAssetItem[] }>(
        "/api/local-assets/upload",
        form,
      );
      if (tab === "images") {
        await addToLibrary(result.files ?? []);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-assets"] });
      if (tab === "images") invalidateLibrary();
    },
  });

  const workflowUploadMutation = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      form.append("library_id", libraryId);
      const wfCat = categories.find((c) => c.type === "workflow");
      if (wfCat?.id) form.append("category_id", wfCat.id);
      return api.upload("/api/asset-library/workflows/upload", form);
    },
    onSuccess: () => invalidateLibrary(),
  });

  const createPromptLib = useMutation({
    mutationFn: (name: string) => api.post("/api/prompt-libraries", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-libraries"] });
      setNewPromptName("");
    },
  });

  const deletePromptLib = useMutation({
    mutationFn: (id: string) => api.delete(`/api/prompt-libraries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompt-libraries"] }),
  });

  const imageItems = useMemo(() => {
    const pool = activeCategory
      ? (activeCategory.items ?? [])
      : imageCategories.flatMap((c) => c.items ?? []);
    return pool.filter((item) => item.url);
  }, [activeCategory, imageCategories]);

  const workflowItems = useMemo(
    () => categories.filter((c) => c.type === "workflow").flatMap((c) => c.items ?? []),
    [categories],
  );

  const localImageItems = useMemo(
    () => (localAssets?.items ?? []).filter((item) => item.url && item.kind !== "video"),
    [localAssets],
  );

  const filterBySearch = <T extends { id: string; name?: string }>(items: T[]) =>
    items.filter((item) => {
      const label = item.name ?? item.id;
      return !search || label.toLowerCase().includes(search.toLowerCase());
    });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = files instanceof FileList ? files : filesToFileList(files);
    uploadMutation.mutate(list);
  };

  const switchTab = (id: Tab) => {
    setTab(id);
    setSelected(new Set());
    setCategoryId("");
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "images", label: t("tabs.assets") },
    { id: "workflows", label: t("tabs.workflows") },
    { id: "prompts", label: t("tabs.prompts") },
    { id: "canvas-assets", label: t("tabs.canvasAssets") },
    { id: "local-media", label: t("tabs.localMedia") },
  ];

  const showDropZone = tab === "images" || tab === "local-media";

  const renderUploadButton = (testId: string, label: string, onClick: () => void, pending?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="studio-action-btn"
      data-testid={testId}
    >
      <Upload className="w-4 h-4" />
      {pending ? t("uploading") : label}
    </button>
  );

  return (
    <div className="studio-asset-shell" data-testid="asset-manager-page">
      <header className="studio-asset-top">
        <div className="studio-asset-top-bar">
          <div className="studio-asset-heading">
            <h1 className="studio-asset-title">{t("title")}</h1>
          </div>
          <div className="studio-asset-top-end">
            <AssetAnnotationToolbar />
          </div>
        </div>

        <nav className="studio-asset-tabs" aria-label={t("title")} role="tablist">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => switchTab(id)}
              data-testid={`asset-tab-${id}`}
              className={cn("studio-asset-tab", tab === id && "active")}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="studio-asset-toolbar">
          {tab !== "prompts" ? (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="studio-asset-search"
              data-testid="asset-search-input"
            />
          ) : (
            <div className="studio-asset-prompt-row">
              <input
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                placeholder={t("actions.newPromptLib")}
                className="studio-asset-prompt-input"
                data-testid="prompt-lib-name-input"
              />
              <button
                type="button"
                onClick={() => createPromptLib.mutate(newPromptName)}
                disabled={!newPromptName.trim()}
                className="studio-action-btn primary"
                data-testid="prompt-lib-create-btn"
              >
                <Plus className="w-4 h-4" />
                {t("actions.create")}
              </button>
            </div>
          )}

          {tab === "images" ? (
            <>
              <div className="studio-asset-chips">
                <button
                  type="button"
                  onClick={() => setCategoryId("")}
                  className={cn("studio-asset-chip", !categoryId && "active")}
                  data-testid="asset-category-all"
                >
                  {t("allCategories")}
                </button>
                {imageCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={cn("studio-asset-chip", categoryId === cat.id && "active")}
                    data-testid={`asset-category-${cat.id}`}
                  >
                    {cat.name ?? cat.id}
                  </button>
                ))}
              </div>
              <span className="studio-asset-toolbar-spacer" />
              {renderUploadButton(
                "asset-upload-btn",
                t("actions.upload"),
                () => fileRef.current?.click(),
                uploadMutation.isPending,
              )}
            </>
          ) : null}

          {tab === "workflows"
            ? renderUploadButton(
                "workflow-upload-btn",
                t("actions.uploadWorkflow"),
                () => workflowRef.current?.click(),
                workflowUploadMutation.isPending,
              )
            : null}

          {tab === "local-media"
            ? renderUploadButton(
                "local-media-upload-btn",
                t("actions.upload"),
                () => fileRef.current?.click(),
                uploadMutation.isPending,
              )
            : null}
        </div>
      </header>

      <div className="studio-asset-body">
        {tab === "images" && (
          <div data-testid="asset-tab-panel-images">
            {showDropZone ? (
              <UploadZone
                testId="asset-drop-zone"
                accept="image/*,video/*,audio/*"
                multiple
                disabled={uploadMutation.isPending}
                onFiles={(files) => handleFiles(files)}
                className="studio-asset-drop-zone"
                label={tStudio("studio.dropAssetsHint")}
              />
            ) : null}

            <AssetMasonry
              items={filterBySearch(imageItems)}
              isLoading={libraryLoading}
              libraryId={libraryId}
              enableTagging
              onPreview={setPreview}
              onDeleted={invalidateLibrary}
              onLibraryUpdated={invalidateLibrary}
              onDragStart={() => undefined}
              testId="asset-library-masonry"
              emptyLabel={t("empty")}
            />
          </div>
        )}

        {tab === "workflows" && (
          <div data-testid="asset-tab-panel-workflows">
            <div className="studio-asset-workflow-grid">
              {filterBySearch(workflowItems).length === 0 ? (
                <p className="text-sm text-[var(--muted)] col-span-full">{t("emptyWorkflows")}</p>
              ) : (
                filterBySearch(workflowItems).map((item) => (
                  <div
                    key={item.id}
                    className="studio-asset-workflow-card"
                    data-testid={`workflow-${item.id}`}
                  >
                    <p className="text-sm font-medium truncate">{item.name ?? item.id}</p>
                    {item.url ? (
                      <p className="text-xs text-[var(--muted)] mt-1 truncate font-mono">{item.url}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "prompts" && (
          <div data-testid="asset-tab-panel-prompts">
            <ul className="space-y-2">
              {filterBySearch(prompts?.libraries ?? []).map((lib) => (
                <li
                  key={lib.id}
                  className="studio-asset-list-item"
                  data-testid={`prompt-lib-${lib.id}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(lib.id)}
                    onChange={() => toggleSelect(lib.id)}
                    data-testid={`prompt-lib-select-${lib.id}`}
                  />
                  <span className="flex-1 text-sm">{lib.name ?? lib.id}</span>
                  <button
                    type="button"
                    onClick={() => deletePromptLib.mutate(lib.id)}
                    className="studio-action-btn danger"
                    aria-label={t("actions.delete")}
                    data-testid={`prompt-lib-delete-${lib.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "canvas-assets" && (
          <div data-testid="asset-tab-panel-canvas-assets">
            {filterBySearch(canvasAssets?.items ?? []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t("emptyCanvas")}</p>
            ) : (
              <AssetMasonry
                items={filterBySearch(canvasAssets?.items ?? []).map((item) => ({
                  id: item.id,
                  name: item.name ?? item.title,
                  url: item.url,
                }))}
                onPreview={setPreview}
                readOnly
                testId="canvas-assets-masonry"
                emptyLabel={t("emptyCanvas")}
              />
            )}
          </div>
        )}

        {tab === "local-media" && (
          <div data-testid="asset-tab-panel-local-media">
            {showDropZone ? (
              <UploadZone
                testId="local-media-drop-zone"
                accept="image/*,video/*,audio/*"
                multiple
                disabled={uploadMutation.isPending}
                onFiles={(files) => handleFiles(files)}
                className="studio-asset-drop-zone"
                label={tStudio("studio.dropAssetsHint")}
              />
            ) : null}
            <AssetMasonry
              items={filterBySearch(localImageItems)}
              isLoading={localLoading}
              onPreview={setPreview}
              onDeleted={async () => {
                await queryClient.invalidateQueries({ queryKey: ["local-assets"] });
              }}
              deleteMany={async (ids) =>
                api.post("/api/local-assets/delete", { names: ids })
              }
              testId="local-media-masonry"
              emptyLabel={t("empty")}
            />
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        data-testid="asset-upload-input"
      />
      <input
        ref={workflowRef}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) workflowUploadMutation.mutate(e.target.files);
          e.target.value = "";
        }}
        data-testid="workflow-upload-input"
      />

      {preview ? <Lightbox url={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
