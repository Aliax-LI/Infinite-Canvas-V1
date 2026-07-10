import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

export interface HistoryItem {
  timestamp: number;
  prompt?: string;
  images?: string[];
  type?: string;
}

interface HistoryMasonryProps {
  type?: string;
  onSelect?: (item: HistoryItem) => void;
  onPreview?: (url: string) => void;
  testId?: string;
}

export function HistoryMasonry({
  type,
  onSelect,
  onPreview,
  testId = "history-masonry",
}: HistoryMasonryProps) {
  const { t } = useTranslation("studio");
  const queryKey = type ? ["history", type] : ["history"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = type ? `?type=${encodeURIComponent(type)}` : "";
      return api.get<HistoryItem[]>(`/api/history${qs}`);
    },
  });

  const items = data ?? [];

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--muted)]" data-testid={`${testId}-loading`}>
        {t("studio.loadingArchives")}
      </p>
    );
  }

  if (!items.length) {
    return (
      <p className="text-sm text-[var(--muted)]" data-testid={`${testId}-empty`}>
        {t("studio.archives")}
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
      data-testid={testId}
    >
      {items.map((item) => {
        const url = item.images?.[0];
        if (!url) return null;
        return (
          <button
            key={item.timestamp}
            type="button"
            className="border border-[var(--border)] overflow-hidden text-left hover:opacity-90"
            onClick={() => {
              onSelect?.(item);
              onPreview?.(url);
            }}
            data-testid={`history-item-${item.timestamp}`}
          >
            <img src={url} alt={item.prompt ?? ""} className="w-full aspect-square object-cover" />
            {item.prompt && (
              <p className="text-xs p-2 truncate text-[var(--muted)]">{item.prompt}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
