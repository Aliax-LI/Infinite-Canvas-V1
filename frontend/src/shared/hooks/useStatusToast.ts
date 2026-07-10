import { useEffect, useState } from "react";

const DEFAULT_MS = 3200;

/** Ephemeral status line that auto-clears like legacy settings status bars. */
export function useStatusToast(clearMs = DEFAULT_MS) {
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    if (!statusText) return;
    const timer = window.setTimeout(() => setStatusText(""), clearMs);
    return () => window.clearTimeout(timer);
  }, [statusText, clearMs]);

  return { statusText, setStatusText };
}
