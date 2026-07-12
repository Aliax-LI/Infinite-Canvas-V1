import { Download, FolderPlus, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasSync } from "../../../shared/hooks/useCanvasSync";
import { useAssetLibrarySync } from "../../../shared/hooks/useAssetLibrarySync";

interface ToolResultActionsProps {
  urls: string[];
  testId?: string;
  /** Optional label for imported canvas nodes / library items */
  itemTitle?: string;
  showDownload?: boolean;
  showAddToLibrary?: boolean;
  showAddToCanvas?: boolean;
}

export function ToolResultActions({
  urls,
  testId = "tool-result-actions",
  itemTitle,
  showDownload = true,
  showAddToLibrary = true,
  showAddToCanvas = true,
}: ToolResultActionsProps) {
  const { t } = useTranslation("studio");
  const { addToCanvas, isAddingToCanvas, canAddToCanvas, statusText: canvasStatus } =
    useCanvasSync();
  const { addToLibrary, isAdding, canAddToLibrary, statusText: libraryStatus } =
    useAssetLibrarySync();

  const cleanUrls = urls.filter(Boolean);
  if (!cleanUrls.length) return null;

  const primaryUrl = cleanUrls[0];
  const busy = isAddingToCanvas || isAdding;
  const statusText = canvasStatus || libraryStatus;

  return (
    <>
      <div className="studio-tool-stage-actions" data-testid={testId}>
      {showAddToCanvas && canAddToCanvas ? (
        <button
          type="button"
          className="studio-tool-stage-action-btn"
          aria-label={t("studio.addToCanvas")}
          title={t("studio.addToCanvas")}
          disabled={busy}
          onClick={() => addToCanvas({ urls: cleanUrls, title: itemTitle })}
          data-testid={`${testId}-canvas`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      ) : null}
      {showAddToLibrary && canAddToLibrary ? (
        <button
          type="button"
          className="studio-tool-stage-action-btn"
          aria-label={t("studio.addToLibrary")}
          title={t("studio.addToLibrary")}
          disabled={busy}
          onClick={() => addToLibrary({ urls: cleanUrls, name: itemTitle })}
          data-testid={`${testId}-library`}
        >
          <FolderPlus className="w-4 h-4" />
        </button>
      ) : null}
      {showDownload && primaryUrl ? (
        <a
          href={primaryUrl}
          download
          className="studio-tool-stage-action-btn"
          aria-label={t("online.downloadImage")}
          data-testid={`${testId}-download`}
        >
          <Download className="w-4 h-4" />
        </a>
      ) : null}
      </div>
      {statusText ? (
        <p className="studio-tool-stage-status" data-testid={`${testId}-status`}>
          {statusText}
        </p>
      ) : null}
    </>
  );
}
