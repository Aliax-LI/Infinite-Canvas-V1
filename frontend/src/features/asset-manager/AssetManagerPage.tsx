import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { api } from "../../shared/api/client";
import { Lightbox } from "../../shared/components/Lightbox";
import { cn } from "../../shared/utils";
import type { AssetLibraryResponse, LocalAssetItem } from "./types";
import { AssetAnnotationToolbar } from "./AssetAnnotationToolbar";
import { CanvasAssetsBrowser } from "./CanvasAssetsBrowser";
import { ImageAssetsBrowser } from "./ImageAssetsBrowser";
import { LocalMediaBrowser } from "./LocalMediaBrowser";
import { PromptLibrariesBrowser } from "./PromptLibrariesBrowser";
import { WorkflowsBrowser } from "./WorkflowsBrowser";

type Tab = "images" | "workflows" | "prompts" | "canvas-assets" | "local-media";

export function AssetManagerPage() {
  const { t } = useTranslation("assets");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("images");
  const [preview, setPreview] = useState<string | null>(null);

  const { data: libraryData, isLoading: libraryLoading } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
  });

  const { data: localAssets, isLoading: localLoading } = useQuery({
    queryKey: ["local-assets"],
    queryFn: () =>
      api.get<{ items?: LocalAssetItem[] }>("/api/local-assets"),
    enabled: tab === "local-media" || tab === "images",
  });

  const invalidateLibrary = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["asset-library"] });
  }, [queryClient]);

  const invalidateLocal = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["local-assets"] });
  }, [queryClient]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["asset-library"] }),
      queryClient.invalidateQueries({ queryKey: ["local-assets"] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-libraries"] }),
      queryClient.invalidateQueries({ queryKey: ["canvas-assets"] }),
    ]);
  }, [queryClient]);

  const localImageItems = useMemo(
    () => (localAssets?.items ?? []).filter((item) => item.url && item.kind !== "video"),
    [localAssets],
  );

  const switchTab = (id: Tab) => {
    setTab(id);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "images", label: t("tabs.assets") },
    { id: "workflows", label: t("tabs.workflows") },
    { id: "prompts", label: t("tabs.prompts") },
    { id: "canvas-assets", label: t("tabs.canvasAssets") },
    { id: "local-media", label: t("tabs.localMedia") },
  ];

  return (
    <div className="studio-asset-shell" data-testid="asset-manager-page">
      <header className="studio-asset-top">
        <div className="studio-asset-top-bar">
          <div className="studio-asset-heading">
            <h1 className="studio-asset-title">{t("title")}</h1>
            <p className="studio-asset-subtitle">{t("subtitle")}</p>
          </div>
          <div className="studio-asset-top-end">
            <button
              type="button"
              className="studio-action-btn"
              data-testid="asset-manager-refresh"
              onClick={() => refreshAll()}
            >
              <RefreshCw className="w-4 h-4" />
              {t("actions.refresh")}
            </button>
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
      </header>

      <div className={cn("studio-asset-body", "studio-asset-body-browser")}>
        {tab === "images" && (
          <div data-testid="asset-tab-panel-images" className="h-full min-h-0">
            <ImageAssetsBrowser
              data={libraryData}
              isLoading={libraryLoading}
              onPreview={setPreview}
              onInvalidate={async () => {
                await invalidateLibrary();
                await invalidateLocal();
              }}
            />
          </div>
        )}

        {tab === "workflows" && (
          <div data-testid="asset-tab-panel-workflows" className="h-full min-h-0">
            <WorkflowsBrowser
              data={libraryData}
              isLoading={libraryLoading}
              onInvalidate={invalidateLibrary}
            />
          </div>
        )}

        {tab === "prompts" && (
          <div data-testid="asset-tab-panel-prompts" className="h-full min-h-0">
            <PromptLibrariesBrowser />
          </div>
        )}

        {tab === "canvas-assets" && (
          <div data-testid="asset-tab-panel-canvas-assets" className="h-full min-h-0">
            <CanvasAssetsBrowser onPreview={setPreview} />
          </div>
        )}

        {tab === "local-media" && (
          <div data-testid="asset-tab-panel-local-media" className="h-full min-h-0">
            <LocalMediaBrowser
              items={localImageItems}
              isLoading={localLoading}
              onPreview={setPreview}
              onInvalidate={invalidateLocal}
            />
          </div>
        )}
      </div>

      {preview ? <Lightbox url={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
