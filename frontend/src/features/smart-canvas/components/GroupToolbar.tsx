import { Download, Grid3x3, LayoutGrid, Ungroup, Eye, Trash2 } from "lucide-react";
import type { SmartNode } from "../core/types";

interface GroupToolbarProps {
  group: SmartNode;
  memberCount: number;
  onLayout: () => void;
  onPreview: () => void;
  onGrid: () => void;
  onDownload: () => void;
  onUngroup: () => void;
  onDelete: () => void;
}

export function GroupToolbar({
  group,
  memberCount,
  onLayout,
  onPreview,
  onGrid,
  onDownload,
  onUngroup,
  onDelete,
}: GroupToolbarProps) {
  return (
    <div
      className="absolute z-20 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-sm text-xs"
      style={{ left: group.x, top: group.y - 36 }}
      data-testid={`group-toolbar-${group.id}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="font-medium mr-1 truncate max-w-[120px] font-serif">
        {group.title || "分组"} ({memberCount})
      </span>
      <button type="button" onClick={onLayout} title="整理" data-testid="group-layout-btn" className="rounded-lg p-1.5 hover:bg-gray-50">
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onPreview} title="预览" data-testid="group-preview-btn" className="rounded-lg p-1.5 hover:bg-gray-50">
        <Eye className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onGrid} title={group.collapsed ? "展开" : "折叠"} data-testid="group-grid-btn" className="rounded-lg p-1.5 hover:bg-gray-50">
        <Grid3x3 className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onDownload} title="下载" data-testid="group-download-btn" className="rounded-lg p-1.5 hover:bg-gray-50">
        <Download className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onUngroup} title="解散" data-testid="group-ungroup-btn" className="rounded-lg p-1.5 hover:bg-gray-50">
        <Ungroup className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="删除分组 (Delete)"
        data-testid="group-delete-btn"
        className="rounded-lg p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
