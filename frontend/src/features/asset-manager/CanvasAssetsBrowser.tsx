import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  ExternalLink,
  FileImage,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Maximize2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { api } from "../../shared/api/client";
import { cn } from "../../shared/utils";
import { AssetBrowserChrome } from "./AssetBrowserChrome";

export interface CanvasAssetItem {
  id: string;
  name?: string;
  title?: string;
  url?: string;
  kind?: string;
  type?: string;
  canvas_id?: string;
  canvas_title?: string;
  canvas_kind?: string;
  canvas_updated_at?: number;
  created_at?: number;
  node_title?: string;
  node_type?: string;
}

interface CanvasAssetCanvas {
  id: string;
  title?: string;
  kind?: string;
}

interface CanvasAssetCategory {
  id: string;
  name?: string;
  count?: number;
}

interface CanvasAssetsResponse {
  categories?: CanvasAssetCategory[];
  canvases?: CanvasAssetCanvas[];
  items?: CanvasAssetItem[];
}

type SortKey =
  | "canvas_asc"
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "kind";

function assetKind(item: CanvasAssetItem) {
  const url = String(item.url || "").toLowerCase();
  const kind = String(item.kind || item.type || "").toLowerCase();
  if (kind.includes("video") || /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(url)) {
    return "video";
  }
  if (kind.includes("audio") || /\.(mp3|wav|flac|ogg|m4a)(\?|#|$)/.test(url)) {
    return "audio";
  }
  if (kind.includes("text") || /\.(txt|json|csv|srt|vtt|md)(\?|#|$)/.test(url)) {
    return "text";
  }
  return "image";
}

function formatDate(value?: number) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

interface CanvasAssetsBrowserProps {
  onPreview: (url: string) => void;
}

export function CanvasAssetsBrowser({ onPreview }: CanvasAssetsBrowserProps) {
  const { t } = useTranslation("assets");
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState("smart");
  const [canvasId, setCanvasId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("canvas_asc");
  const [manageMode, setManageMode] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["canvas-assets"],
    queryFn: () => api.get<CanvasAssetsResponse>("/api/canvas-assets"),
  });

  const categories = data?.categories?.length
    ? data.categories
    : [
        { id: "smart", name: t("canvasAssets.smart"), count: 0 },
        { id: "classic", name: t("canvasAssets.classic"), count: 0 },
      ];

  useEffect(() => {
    if (!categories.some((cat) => cat.id === categoryId)) {
      setCategoryId(categories[0]?.id || "smart");
    }
  }, [categories, categoryId]);

  const canvases = useMemo(() => {
    return (data?.canvases || []).filter(
      (canvas) => (canvas.kind || "classic") === categoryId,
    );
  }, [data?.canvases, categoryId]);

  useEffect(() => {
    if (canvasId && !canvases.some((canvas) => canvas.id === canvasId)) {
      setCanvasId("");
    }
  }, [canvases, canvasId]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (data?.items || []).filter((item) => {
      const kind = item.canvas_kind || "classic";
      if (kind !== categoryId) return false;
      if (canvasId && item.canvas_id !== canvasId) return false;
      if (!q) return true;
      return [
        item.name,
        item.title,
        item.canvas_title,
        item.node_title,
        item.node_type,
        item.url,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sort === "name_asc") {
        return String(a.name || "").localeCompare(String(b.name || ""));
      }
      if (sort === "kind") {
        return assetKind(a).localeCompare(assetKind(b));
      }
      if (sort === "updated_asc") {
        return (a.canvas_updated_at || a.created_at || 0) -
          (b.canvas_updated_at || b.created_at || 0);
      }
      if (sort === "updated_desc") {
        return (b.canvas_updated_at || b.created_at || 0) -
          (a.canvas_updated_at || a.created_at || 0);
      }
      return String(a.canvas_title || "").localeCompare(
        String(b.canvas_title || ""),
      );
    });
    return list;
  }, [data?.items, categoryId, canvasId, search, sort]);

  useEffect(() => {
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    setSelectedId(items[0]?.id || "");
  }, [items, selectedId]);

  const selected = items.find((item) => item.id === selectedId) || null;

  const kindLabel = (item: CanvasAssetItem) => {
    const kind = assetKind(item);
    if (kind === "video") return t("canvasAssets.kindVideo");
    if (kind === "audio") return t("canvasAssets.kindAudio");
    if (kind === "text") return t("canvasAssets.kindText");
    return t("canvasAssets.kindImage");
  };

  const downloadItem = async (item: CanvasAssetItem) => {
    if (!item.url) return;
    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.name || "asset";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadSelected = async () => {
    const selectedItems = items.filter((item) => batchIds.has(item.id) && item.url);
    if (!selectedItems.length) return;
    if (selectedItems.length === 1) {
      await downloadItem(selectedItems[0]);
      return;
    }
    const blob = await api.postBlob("/api/canvas-assets/download", {
      items: selectedItems.map((item) => ({
        url: item.url,
        name: item.name || item.id,
      })),
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "canvas-assets.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const nav = (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("canvasAssets.navTitle")}</strong>
          <span>{t("canvasAssets.navHint")}</span>
        </div>
      </div>
      <div className="studio-asset-nav-scroll">
        <div className="studio-asset-tree canvas-asset-tree">
          {categories.map((cat) => {
            const activeParent = cat.id === categoryId && !canvasId;
            const containsActive = cat.id === categoryId && !!canvasId;
            const catCanvases = (data?.canvases || []).filter(
              (canvas) => (canvas.kind || "classic") === cat.id,
            );
            return (
              <div
                key={cat.id}
                className={cn(
                  "studio-asset-tree-branch",
                  cat.id === categoryId && "expanded",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "studio-asset-tree-row parent",
                    activeParent && "active",
                    containsActive && "contains-active",
                  )}
                  data-testid={`canvas-asset-cat-${cat.id}`}
                  onClick={() => {
                    setCategoryId(cat.id);
                    setCanvasId("");
                  }}
                >
                  <span className="studio-asset-tree-icon">
                    {cat.id === "smart" ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : (
                      <LayoutGrid className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="studio-asset-tree-name">
                    {cat.name || cat.id}
                  </span>
                  <span className="studio-asset-tree-count">
                    {Number(cat.count || 0)}
                  </span>
                </button>
                {cat.id === categoryId ? (
                  <div className="studio-asset-tree-children">
                    {catCanvases.length === 0 ? (
                      <div className="studio-asset-tree-empty">
                        {t("canvasAssets.noCanvases")}
                      </div>
                    ) : (
                      catCanvases.map((canvas) => {
                        const count = (data?.items || []).filter(
                          (item) => item.canvas_id === canvas.id,
                        ).length;
                        return (
                          <button
                            key={canvas.id}
                            type="button"
                            className={cn(
                              "studio-asset-tree-row child",
                              canvas.id === canvasId && "active",
                            )}
                            data-testid={`canvas-asset-canvas-${canvas.id}`}
                            onClick={() => {
                              setCategoryId(cat.id);
                              setCanvasId(canvas.id);
                            }}
                          >
                            <span className="studio-asset-tree-elbow" />
                            <span className="studio-asset-tree-icon">
                              {canvas.kind === "smart" ? (
                                <Sparkles className="w-3.5 h-3.5" />
                              ) : (
                                <FileImage className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <span
                              className="studio-asset-tree-name"
                              title={canvas.title || t("canvasAssets.untitled")}
                            >
                              {canvas.title || t("canvasAssets.untitled")}
                            </span>
                            <span className="studio-asset-tree-count">{count}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="studio-asset-nav-hint">
          {t("canvasAssets.summary", {
            canvases: data?.canvases?.length || 0,
            assets: data?.items?.length || 0,
          })}
        </div>
      </div>
    </>
  );

  const content = (
    <>
      <div className="studio-asset-panel-head studio-asset-content-head">
        <div className="studio-asset-content-heading">
          <strong>
            {canvasId
              ? canvases.find((c) => c.id === canvasId)?.title ||
                t("canvasAssets.untitled")
              : categories.find((c) => c.id === categoryId)?.name ||
                t("tabs.canvasAssets")}
          </strong>
          <span>{t("canvasAssets.itemCount", { count: items.length })}</span>
        </div>
        <div className="studio-asset-content-tools">
          <button
            type="button"
            className="studio-action-btn"
            disabled={isFetching}
            data-testid="canvas-asset-refresh"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ["canvas-assets"] });
              await refetch();
            }}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            {t("canvasAssets.refresh")}
          </button>
          <label className="studio-asset-search-wrap">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("canvasAssets.searchPlaceholder")}
              data-testid="canvas-asset-search"
            />
          </label>
          <select
            className="studio-asset-sort-select"
            value={sort}
            data-testid="canvas-asset-sort"
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="canvas_asc">{t("canvasAssets.sortCanvas")}</option>
            <option value="updated_desc">{t("canvasAssets.sortUpdatedDesc")}</option>
            <option value="updated_asc">{t("canvasAssets.sortUpdatedAsc")}</option>
            <option value="name_asc">{t("canvasAssets.sortName")}</option>
            <option value="kind">{t("canvasAssets.sortKind")}</option>
          </select>
          <button
            type="button"
            className={cn("studio-action-btn", manageMode && "primary")}
            disabled={!items.length}
            data-testid="canvas-asset-manage"
            onClick={() => {
              setManageMode((v) => !v);
              setBatchIds(new Set());
            }}
          >
            <ListChecks className="w-4 h-4" />
            {manageMode ? t("browser.manageDone") : t("browser.manage")}
          </button>
        </div>
      </div>

      {manageMode ? (
        <div className="studio-asset-manage-bar">
          <span>
            {t("canvasAssets.selectedCount", { count: batchIds.size })}
          </span>
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
              className="studio-action-btn"
              disabled={!batchIds.size}
              onClick={() => setBatchIds(new Set())}
            >
              {t("browser.clearSelection")}
            </button>
            <button
              type="button"
              className="studio-action-btn primary"
              disabled={!batchIds.size}
              data-testid="canvas-asset-download-selected"
              onClick={() => downloadSelected()}
            >
              <Download className="w-4 h-4" />
              {t("canvasAssets.downloadSelected")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-asset-content-scroll">
        {isLoading ? (
          <p className="studio-asset-empty-inline">{t("browser.loading")}</p>
        ) : items.length === 0 ? (
          <div className="studio-asset-empty-state" data-testid="canvas-assets-empty">
            {t("canvasAssets.empty")}
          </div>
        ) : (
          <div className="studio-asset-grid">
            {items.map((item) => (
              <article
                key={item.id}
                className={cn(
                  "studio-asset-card",
                  item.id === selectedId && "active",
                )}
                data-testid={`canvas-asset-item-${item.id}`}
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
                  />
                ) : null}
                <div className="studio-asset-card-thumb">
                  {item.url && assetKind(item) === "image" ? (
                    <img src={item.url} alt={item.name || ""} />
                  ) : (
                    <LayoutDashboard className="w-7 h-7 opacity-50" />
                  )}
                </div>
                <div className="studio-asset-card-body">
                  <div className="studio-asset-card-name" title={item.name}>
                    {item.name || item.title || item.id}
                  </div>
                  <div className="studio-asset-card-meta">
                    {kindLabel(item)} ·{" "}
                    {item.canvas_title || t("canvasAssets.untitled")}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const canPreview =
    selected && ["image", "video"].includes(assetKind(selected)) && selected.url;

  const detail = selected ? (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("canvasAssets.detailTitle")}</strong>
          <span>{kindLabel(selected)}</span>
        </div>
        <div className="studio-asset-panel-actions">
          {canPreview ? (
            <button
              type="button"
              className="studio-asset-icon-btn"
              title={t("canvasAssets.preview")}
              aria-label={t("canvasAssets.preview")}
              data-testid="canvas-asset-preview"
              onClick={() => selected.url && onPreview(selected.url)}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("canvasAssets.open")}
            aria-label={t("canvasAssets.open")}
            onClick={() => selected.url && window.open(selected.url, "_blank")}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="studio-asset-icon-btn"
            title={t("canvasAssets.copy")}
            aria-label={t("canvasAssets.copy")}
            onClick={() => selected.url && navigator.clipboard?.writeText(selected.url)}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="studio-action-btn primary"
            data-testid="canvas-asset-download"
            onClick={() => downloadItem(selected)}
          >
            <Download className="w-4 h-4" />
            {t("canvasAssets.download")}
          </button>
        </div>
      </div>
      <div className="studio-asset-detail-scroll" data-testid="canvas-asset-detail">
        <div className="studio-asset-detail-media">
          {selected.url && assetKind(selected) === "image" ? (
            <button
              type="button"
              className="studio-asset-detail-media-frame"
              onClick={() => onPreview(selected.url!)}
            >
              <img src={selected.url} alt={selected.name || ""} />
            </button>
          ) : (
            <div className="studio-asset-detail-media-frame">
              <LayoutDashboard className="w-10 h-10 opacity-40" />
            </div>
          )}
        </div>
        <div className="studio-asset-detail-name-static">
          {selected.name || selected.title || selected.id}
        </div>
        <div className="studio-asset-detail-meta">
          <div>
            <span>{t("canvasAssets.metaType")}</span>
            <strong>{kindLabel(selected)}</strong>
          </div>
          <div>
            <span>{t("canvasAssets.metaCanvas")}</span>
            <strong>{selected.canvas_title || t("canvasAssets.untitled")}</strong>
          </div>
          <div>
            <span>{t("canvasAssets.metaUpdated")}</span>
            <strong>
              {formatDate(selected.canvas_updated_at || selected.created_at)}
            </strong>
          </div>
          <div>
            <span>{t("canvasAssets.metaNode")}</span>
            <strong>{selected.node_title || selected.node_type || "—"}</strong>
          </div>
        </div>
        <div className="studio-asset-detail-url">{selected.url || ""}</div>
      </div>
    </>
  ) : (
    <>
      <div className="studio-asset-panel-head">
        <div className="studio-asset-panel-title">
          <strong>{t("canvasAssets.detailTitle")}</strong>
          <span>{t("canvasAssets.detailEmptyHint")}</span>
        </div>
      </div>
      <div className="studio-asset-detail-scroll">
        <div className="studio-asset-detail-empty" data-testid="canvas-asset-detail-empty">
          <LayoutDashboard className="w-8 h-8 opacity-40" />
          <span>{t("canvasAssets.detailEmpty")}</span>
        </div>
      </div>
    </>
  );

  return (
    <AssetBrowserChrome
      testId="canvas-assets-browser"
      nav={nav}
      content={content}
      detail={detail}
    />
  );
}
