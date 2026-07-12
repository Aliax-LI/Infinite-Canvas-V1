import { useEffect } from "react";
import { Download, Upload, X } from "lucide-react";

interface WorkflowTransferModalProps {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function WorkflowTransferModal({
  open,
  onClose,
  onImport,
  onExport,
}: WorkflowTransferModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-testid="workflow-transfer-modal"
      role="dialog"
      aria-modal="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-lg" onPointerDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-medium font-serif">导入 / 导出工作流</h2>
            <p className="text-sm text-gray-500 mt-1 font-serif">
              导出当前画布为 ZIP/JSON，或导入工作流到本画布
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-black"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onImport();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 border border-gray-200 text-sm font-serif hover:border-black"
            data-testid="workflow-import-btn"
          >
            <Upload className="w-4 h-4" />
            导入
          </button>
          <button
            type="button"
            onClick={() => {
              onExport();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 bg-black text-white text-sm font-serif hover:bg-gray-900"
            data-testid="workflow-export-btn"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>
    </div>
  );
}
