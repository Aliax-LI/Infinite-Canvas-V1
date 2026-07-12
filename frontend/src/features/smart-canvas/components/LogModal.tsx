import { useEffect } from "react";
import type { LogEntry } from "../core/types";

interface LogModalProps {
  open: boolean;
  onClose: () => void;
  logs: LogEntry[];
}

export function LogModal({ open, onClose, logs }: LogModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="log-modal" role="dialog" aria-modal="true" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-lg max-h-[70vh] flex flex-col" onPointerDown={(event) => event.stopPropagation()}>
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
                <div className="flex items-center justify-between gap-2 text-[var(--muted)] text-xs">
                  <span>{log.engine} · {log.kind}</span>
                  <span className={log.status === "failed" ? "text-red-600" : "text-emerald-600"}>
                    {log.status === "failed" ? "失败" : "成功"}
                  </span>
                </div>
                <div className="truncate">{log.prompt}</div>
                {log.error ? <div className="mt-1 text-xs text-red-600" role="alert">{log.error}</div> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
