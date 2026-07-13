import { useEffect } from "react";

interface SmartToastProps {
  message: string;
  onClear: () => void;
  durationMs?: number;
}

/** History-aligned floating toast (top-right, ~1.8s). */
export function SmartToast({ message, onClear, durationMs = 1800 }: SmartToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClear, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onClear, durationMs]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="pointer-events-none absolute right-6 top-6 z-[60] max-w-[360px] border border-[var(--border)] bg-[var(--bg)]/95 px-3.5 py-2.5 text-xs font-extrabold shadow-[0_16px_44px_var(--shadow)] backdrop-blur-md"
      data-testid="smart-toast"
    >
      {message}
    </div>
  );
}
