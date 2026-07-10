import type { LogEntry } from "../core/types";

interface LogModalProps {
  open: boolean;
  onClose: () => void;
  logs: LogEntry[];
}

export function LogModal({ open, onClose, logs }: LogModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="log-modal">
      <div className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-lg max-h-[70vh] flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-medium">生成日志</h2>
          <button type="button" onClick={onClose}>关闭</button>
        </header>
        <ul className="overflow-auto p-4 space-y-2 flex-1">
          {logs.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">暂无日志</li>
          ) : (
            logs.map((log) => (
              <li key={log.id} className="text-sm border border-[var(--border)] p-2">
                <div className="text-[var(--muted)] text-xs">{log.engine} · {log.kind}</div>
                <div className="truncate">{log.prompt}</div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
