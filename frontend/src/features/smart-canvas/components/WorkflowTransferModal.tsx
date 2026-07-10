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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="workflow-transfer-modal">
      <div className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-md p-6">
        <h2 className="font-medium mb-2">工作流传输</h2>
        <p className="text-sm text-[var(--muted)] mb-4">导入/导出画布工作流 ZIP 或 JSON</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { onImport(); onClose(); }}
            className="flex-1 px-4 py-2 border border-[var(--border)]"
            data-testid="workflow-import-btn"
          >
            导入
          </button>
          <button
            type="button"
            onClick={() => { onExport(); onClose(); }}
            className="flex-1 px-4 py-2 bg-black text-white"
            data-testid="workflow-export-btn"
          >
            导出
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-4 text-sm underline">取消</button>
      </div>
    </div>
  );
}
