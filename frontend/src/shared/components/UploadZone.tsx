import { useCallback, useState, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  /** Handle non-file drops (e.g. archive image URLs). Return true when consumed. */
  onTransfer?: (dataTransfer: DataTransfer) => boolean;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
  className?: string;
  children?: ReactNode;
}

export function UploadZone({
  onFiles,
  onTransfer,
  accept = "image/*",
  multiple = true,
  disabled = false,
  label,
  testId = "upload-zone",
  className,
  children,
}: UploadZoneProps) {
  const { t } = useTranslation("studio");
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      if (onTransfer?.(e.dataTransfer)) return;
      const files = [...e.dataTransfer.files];
      if (files.length) onFiles(files);
    },
    [disabled, onFiles, onTransfer],
  );

  return (
    <div
      className={cn(
        "border border-dashed border-[var(--border)] p-6 text-center transition-colors",
        dragOver && "bg-[var(--nav-hover-bg)]",
        disabled ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-[var(--nav-hover-bg)]",
        className,
      )}
      data-testid={testId}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (disabled) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.onchange = () => {
          if (input.files?.length) onFiles([...input.files]);
        };
        input.click();
      }}
    >
      {children ?? (
        <>
          <Upload className="w-8 h-8 mx-auto mb-2 text-[var(--muted)]" />
          <p className="text-sm text-[var(--muted)]">
            {label ?? t("studio.dropImage")}
          </p>
        </>
      )}
    </div>
  );
}
