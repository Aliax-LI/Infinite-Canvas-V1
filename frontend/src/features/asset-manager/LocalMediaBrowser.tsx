import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  Image as ImageIcon,
  ListChecks,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { api } from "../../shared/api/client";
import { cn } from "../../shared/utils";
import { AssetBrowserChrome } from "./AssetBrowserChrome";
import type { LocalAssetItem } from "./types";

interface LocalMediaBrowserProps {
  items: LocalAssetItem[];
  isLoading: boolean;
  onPreview: (url: string) => void;
  onInvalidate: () => void | Promise<void>;
}

function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((file) => dt.items.add(file));
  return dt.files;
}

export function LocalMediaBrowser({
  items: rawItems,
  isLoading,
  onPreview,
  onInvalidate,
}: LocalMediaBrowserProps) {
  const { t } = useTranslation("assets");
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  const items = useMemo(() => {
    const pool = rawItems.filter((item) => item.url && item.kind !== "video");
    if (!search.trim()) return pool;
    const q = search.toLowerCase();
    return pool.filter((item) => (item.name ?? item.id).toLowerCase().includes(q));
  }, [rawItems, search]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const uploadMutation = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      return api.upload("/api/local-assets/upload", form);
    },
    onSuccess: () => onInvalidate(),
  });

  const deleteBatch = useMutation({
    mutationFn: (ids: string[]) => api.post("/api/local-assets/delete", { names: ids }),
    onSuccess: async () => {
      setBatchIds(new Set());
      setManageMode(false);
      setSelectedId(null);
      await onInvalidate();
    },
  });

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = files instanceof FileList ? files : filesToFileList(files);
    uploadMutation.mutate(list);
  };

  const nav = (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("browser.localNavTitle")}</strong>
          <span>{t("browser.localNavHint")}</span>
        </div>
      </div>
      <div className="studio-asset-nav-scroll">
        <div className="studio-asset-tree">
          <button
            type="button"
            className="studio-asset-tree-row parent active"
            data-testid="local-media-root"
          >
            <span className="studio-asset-tree-icon">
              <FolderOpen className="w-3.5 h-3.5" />
            </span>
            <span className="studio-asset-tree-name">{t("tabs.localMedia")}</span>
            <span className="studio-asset-tree-count">{items.length}</span>
          </button>
        </div>
      </div>
    </>
  );

  const content = (
    <>
      <div className="studio-asset-content-toolbar">
        <div className="studio-asset-content-heading">
          <strong>{t("tabs.localMedia")}</strong>
          <span>{t("browser.itemCount", { count: items.length })}</span>
        </div>
        <div className="studio-asset-content-tools">
          <label className="studio-asset-search-wrap">
            <Search className="w-3.5 h-3.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              data-testid="local-media-search-input"
            />
          </label>
          <button
            type="button"
            className="studio-action-btn primary"
            disabled={uploadMutation.isPending}
            onClick={() => fileRef.current?.click()}
            data-testid="local-media-upload-btn"
          >
            <UploadCloud className="w-4 h-4" />
            {uploadMutation.isPending ? t("uploading") : t("actions.upload")}
          </button>
          <button
            type="button"
            className={cn("studio-action-btn", manageMode && "primary")}
            onClick={() => {
              setManageMode((v) => !v);
              setBatchIds(new Set());
            }}
            data-testid="local-media-manage-btn"
          >
            <ListChecks className="w-4 h-4" />
            {manageMode ? t("browser.manageDone") : t("browser.manage")}
          </button>
        </div>
      </div>

      {manageMode ? (
        <div className="studio-asset-manage-bar" data-testid="local-media-manage-bar">
          <span>{t("browser.selectedCount", { count: batchIds.size })}</span>
          <div className="studio-asset-content-tools">
            <button
              type="button"
              className="studio-action-btn"
              disabled={!items.length}
              onClick={() => setBatchIds(new Set(items.map((i) => i.id)))}
            >
              {t("browser.selectAll")}
            </button>
            <button
              type="button"
              className="studio-action-btn danger"
              disabled={!batchIds.size || deleteBatch.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    t("browser.deleteSelectedConfirm", { count: batchIds.size }),
                  )
                ) {
                  deleteBatch.mutate([...batchIds]);
                }
              }}
              data-testid="local-media-delete-selected"
            >
              <Trash2 className="w-4 h-4" />
              {t("browser.deleteSelected")}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="studio-asset-content-scroll"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {isLoading ? (
          <p className="studio-asset-empty-inline">{t("browser.loading")}</p>
        ) : (
          <div className={cn("studio-asset-grid", dragOver && "drag-over")}>
            <button
              type="button"
              className="studio-asset-upload-card"
              disabled={uploadMutation.isPending}
              onClick={() => fileRef.current?.click()}
              data-testid="local-media-drop-zone"
            >
              <span className="studio-asset-upload-thumb">
                <UploadCloud className="w-7 h-7" />
              </span>
              <span className="studio-asset-upload-body">
                <strong>{t("browser.uploadCardTitle")}</strong>
                <small>{t("browser.uploadCardHint")}</small>
              </span>
            </button>
            {items.map((item) => (
              <article
                key={item.id}
                className={cn("studio-asset-card", item.id === selectedId && "active")}
                data-testid={`asset-item-${item.id}`}
                onClick={() => setSelectedId(item.id)}
              >
                {manageMode ? (
                  <input
                    type="checkbox"
                    className="studio-asset-card-check"
                    checked={batchIds.has(item.id)}
                    onChange={() => {
                      setBatchIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`asset-select-${item.id}`}
                  />
                ) : null}
                <div className="studio-asset-card-thumb">
                  {item.url ? (
                    <img src={item.url} alt={item.name ?? item.id} loading="lazy" />
                  ) : null}
                </div>
                <div className="studio-asset-card-body">
                  <div className="studio-asset-card-name">{item.name ?? item.id}</div>
                </div>
              </article>
            ))}
            {!items.length ? (
              <div className="studio-asset-empty-state" data-testid="local-media-empty">
                {t("browser.emptyLocal")}
              </div>
            ) : null}
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
        data-testid="local-media-upload-input"
      />
    </>
  );

  const detail = selected ? (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("browser.detailTitle")}</strong>
          <span>{selected.kind ?? "image"}</span>
        </div>
        <div className="studio-asset-panel-actions">
          <button
            type="button"
            className="studio-asset-icon-btn danger"
            aria-label={t("actions.delete")}
            onClick={() => {
              if (window.confirm(t("browser.deleteSelectedConfirm", { count: 1 }))) {
                deleteBatch.mutate([selected.id]);
              }
            }}
            data-testid="local-detail-delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="studio-asset-detail-scroll">
        <button
          type="button"
          className="studio-asset-detail-media"
          onClick={() => selected.url && onPreview(selected.url)}
          data-testid="local-detail-preview"
        >
          {selected.url ? (
            <img src={selected.url} alt={selected.name ?? selected.id} />
          ) : null}
        </button>
        <div className="studio-asset-detail-name-static">{selected.name ?? selected.id}</div>
        {selected.url ? (
          <div className="studio-asset-detail-url">{selected.url}</div>
        ) : null}
      </div>
    </>
  ) : (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("browser.detailTitle")}</strong>
          <span>{t("browser.detailEmptyHint")}</span>
        </div>
      </div>
      <div className="studio-asset-detail-scroll">
        <div className="studio-asset-detail-empty" data-testid="local-detail-empty">
          <ImageIcon className="w-7 h-7" />
          <span>{t("browser.detailEmpty")}</span>
        </div>
      </div>
    </>
  );

  return (
    <AssetBrowserChrome
      testId="local-media-browser"
      nav={nav}
      content={content}
      detail={detail}
    />
  );
}
