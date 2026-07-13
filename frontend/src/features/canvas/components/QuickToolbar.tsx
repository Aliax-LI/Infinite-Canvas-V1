import {
  AlignHorizontalJustifyCenter,
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutGrid,
  Scissors,
  Trash2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deleteKeyLabel,
  formatModShortcut,
  modKeyLabel,
} from "../../../shared/utils/platformShortcuts";

interface QuickToolbarProps {
  selectedCount: number;
  knifeMode: boolean;
  onGroup: () => void;
  onArrangeSelected: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleKnife: () => void;
  onFit: () => void;
}

export function QuickToolbar({
  selectedCount,
  knifeMode,
  onGroup,
  onArrangeSelected,
  onCopy,
  onDelete,
  onToggleKnife,
  onFit,
}: QuickToolbarProps) {
  const { t } = useTranslation("canvas");
  const [expanded, setExpanded] = useState(true);
  const mod = modKeyLabel();

  return (
    <div
      className="absolute left-4 bottom-4 z-30 flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm"
      data-testid="quick-toolbar"
      data-expanded={expanded ? "1" : "0"}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex items-center justify-center p-2 border-b border-gray-100 text-gray-500 hover:text-black"
        title={expanded ? t("quickToolbarCollapse") : t("quickToolbarExpand")}
        data-testid="quick-toolbar-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
      {expanded ? (
        <div className="flex flex-col p-1 gap-0.5">
          <ToolbarBtn
            testId="quick-toolbar-group"
            title={t("groupSelected", { mod })}
            onClick={onGroup}
            disabled={selectedCount < 1}
          >
            <LayoutGrid className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            testId="quick-toolbar-arrange"
            title={t("arrangeSelected")}
            onClick={onArrangeSelected}
            disabled={selectedCount < 2}
          >
            <AlignHorizontalJustifyCenter className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            testId="quick-toolbar-copy"
            title={formatModShortcut(["C"])}
            onClick={onCopy}
            disabled={!selectedCount}
          >
            <Copy className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            testId="quick-toolbar-delete"
            title={deleteKeyLabel()}
            onClick={onDelete}
            disabled={!selectedCount}
          >
            <Trash2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            testId="quick-toolbar-knife"
            title={t("knifeMode")}
            onClick={onToggleKnife}
            active={knifeMode}
          >
            <Scissors className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn testId="quick-toolbar-fit" title={t("generatePanel.fitViewport")} onClick={onFit}>
            <Wand2 className="w-4 h-4" />
          </ToolbarBtn>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarBtn({
  children,
  title,
  onClick,
  disabled,
  active,
  testId,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      title={title}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? "bg-black text-white"
          : "text-gray-600 hover:bg-gray-50 hover:text-black disabled:opacity-40"
      }`}
    >
      {children}
    </button>
  );
}
