import { Download, Grid3x3, LayoutGrid, Ungroup, Eye } from "lucide-react";
import type { SmartNode } from "../core/types";

interface GroupToolbarProps {
  group: SmartNode;
  memberCount: number;
  onLayout: () => void;
  onPreview: () => void;
  onGrid: () => void;
  onDownload: () => void;
  onUngroup: () => void;
}

export function GroupToolbar({
  group,
  memberCount,
  onLayout,
  onPreview,
  onGrid,
  onDownload,
  onUngroup,
}: GroupToolbarProps) {
  return (
    <div
      className="absolute flex items-center gap-1 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] shadow-sm text-xs z-20"
      style={{ left: group.x, top: group.y - 36 }}
      data-testid={`group-toolbar-${group.id}`}
    >
      <span className="font-medium mr-1 truncate max-w-[120px]">
        {group.title || "分组"} ({memberCount})
      </span>
      <button type="button" onClick={onLayout} title="整理" data-testid="group-layout-btn" className="p-1 hover:bg-[var(--nav-hover-bg)]">
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onPreview} title="预览" data-testid="group-preview-btn" className="p-1 hover:bg-[var(--nav-hover-bg)]">
        <Eye className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onGrid} title="宫格" data-testid="group-grid-btn" className="p-1 hover:bg-[var(--nav-hover-bg)]">
        <Grid3x3 className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onDownload} title="下载" data-testid="group-download-btn" className="p-1 hover:bg-[var(--nav-hover-bg)]">
        <Download className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onUngroup} title="解散" data-testid="group-ungroup-btn" className="p-1 hover:bg-[var(--nav-hover-bg)]">
        <Ungroup className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
