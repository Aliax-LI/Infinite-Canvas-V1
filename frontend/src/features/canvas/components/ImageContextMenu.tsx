import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Eye, ImagePlus } from "lucide-react";

export interface ImageContextMenuTarget {
  screenX: number;
  screenY: number;
  nodeId: string;
  url: string;
  name?: string;
}

interface ImageContextMenuProps {
  target: ImageContextMenuTarget;
  onClose: () => void;
  onPreview?: (nodeId: string, url: string) => void;
  onCreateImport: (nodeId: string, url: string, name?: string) => void;
}

export function ImageContextMenu({
  target,
  onClose,
  onPreview,
  onCreateImport,
}: ImageContextMenuProps) {
  const { t } = useTranslation("canvas");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const menuW = 220;
  const left = Math.max(
    14,
    Math.min(
      target.screenX,
      (typeof window !== "undefined" ? window.innerWidth : target.screenX) -
        menuW -
        14,
    ),
  );
  const top = Math.max(
    14,
    Math.min(
      target.screenY,
      (typeof window !== "undefined" ? window.innerHeight : target.screenY) - 140,
    ),
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[220px] border border-[var(--border)] bg-[var(--bg)]/95 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.14)] backdrop-blur-md"
      style={{ left, top }}
      data-testid="legacy-image-context-menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {onPreview ? (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-[var(--nav-hover-bg)]"
          data-testid="legacy-image-menu-preview"
          onClick={() => {
            onPreview(target.nodeId, target.url);
            onClose();
          }}
        >
          <Eye className="h-4 w-4 shrink-0" />
          <span>{t("imageMenuPreview", { defaultValue: "预览" })}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-[var(--nav-hover-bg)]"
        data-testid="legacy-image-menu-create-import"
        onClick={() => {
          onCreateImport(target.nodeId, target.url, target.name);
          onClose();
        }}
      >
        <ImagePlus className="h-4 w-4 shrink-0" />
        <span>
          {t("imageMenuCreateImport", {
            defaultValue: "导入图片",
          })}
        </span>
      </button>
    </div>
  );
}
