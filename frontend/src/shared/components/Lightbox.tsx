import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { downloadImage } from "../utils/downloadImage";

export interface LightboxExtraAction {
  label: string;
  onClick: () => void;
  testId?: string;
}

export interface LightboxProps {
  /** Single-image mode (backward compatible). */
  url?: string;
  /** Multi-image gallery; takes precedence over `url` when non-empty. */
  urls?: string[];
  /** Initial index into `urls` (default 0). */
  index?: number;
  alt?: string;
  onClose: () => void;
  /** Called when user navigates; optional for uncontrolled usage. */
  onIndexChange?: (index: number) => void;
  /** Optional footer action (e.g. add archive image as reference). */
  extraAction?: LightboxExtraAction;
}

export function Lightbox({
  url,
  urls,
  index = 0,
  alt = "preview",
  onClose,
  onIndexChange,
  extraAction,
}: LightboxProps) {
  const { t } = useTranslation("common");
  const images = useMemo(() => {
    if (Array.isArray(urls) && urls.length > 0) return urls.filter(Boolean);
    return url ? [url] : [];
  }, [url, urls]);

  const [active, setActive] = useState(() =>
    Math.min(Math.max(0, index), Math.max(0, images.length - 1)),
  );
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setActive(Math.min(Math.max(0, index), Math.max(0, images.length - 1)));
  }, [index, images.length]);

  const currentUrl = images[active] ?? "";
  const multi = images.length > 1;

  const go = (next: number) => {
    if (!images.length) return;
    const clamped = ((next % images.length) + images.length) % images.length;
    setActive(clamped);
    onIndexChange?.(clamped);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (images.length <= 1) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setActive((current) => {
          const delta = e.key === "ArrowLeft" ? -1 : 1;
          const next = ((current + delta) % images.length + images.length) % images.length;
          onIndexChange?.(next);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, images.length, onIndexChange]);

  const handleDownload = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!currentUrl || downloading) return;
    setDownloading(true);
    try {
      await downloadImage(currentUrl, `online-image-${Date.now()}.png`);
    } catch {
      // Fallback: open in new tab if blob fetch fails
      window.open(currentUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  if (!currentUrl) return null;

  return (
    <div
      className="studio-lightbox"
      data-testid="lightbox"
      onClick={onClose}
    >
      <div className="studio-lightbox-toolbar">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="studio-lightbox-icon-btn"
          aria-label={t("download")}
          data-testid="lightbox-download"
        >
          <Download aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="studio-lightbox-icon-btn"
          aria-label={t("close")}
          data-testid="lightbox-close"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {multi && (
        <>
          <button
            type="button"
            className="studio-lightbox-icon-btn studio-lightbox-nav-btn prev"
            aria-label={t("prev")}
            data-testid="lightbox-prev"
            onClick={(e) => {
              e.stopPropagation();
              go(active - 1);
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="studio-lightbox-icon-btn studio-lightbox-nav-btn next"
            aria-label={t("next")}
            data-testid="lightbox-next"
            onClick={(e) => {
              e.stopPropagation();
              go(active + 1);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </>
      )}

      <div
        className="studio-lightbox-stage"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentUrl}
          alt={alt}
          className="studio-lightbox-image"
          data-testid="lightbox-image"
        />
      </div>

      {(multi || extraAction) && (
        <div className="studio-lightbox-footer">
          {multi ? (
            <span className="studio-lightbox-counter" data-testid="lightbox-counter">
              {active + 1} / {images.length}
            </span>
          ) : null}
          {extraAction ? (
            <button
              type="button"
              className="studio-lightbox-extra-btn"
              data-testid={extraAction.testId ?? "lightbox-extra-action"}
              onClick={(e) => {
                e.stopPropagation();
                extraAction.onClick();
              }}
            >
              {extraAction.label}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
