import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LightboxProps {
  url: string;
  alt?: string;
  onClose: () => void;
}

export function Lightbox({ url, alt = "preview", onClose }: LightboxProps) {
  const { t } = useTranslation("common");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
      data-testid="lightbox"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 text-white hover:opacity-80"
        aria-label={t("close")}
        data-testid="lightbox-close"
      >
        <X className="w-8 h-8" />
      </button>
      <img
        src={url}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-image"
      />
    </div>
  );
}
