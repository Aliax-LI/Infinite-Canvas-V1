import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Keyboard,
  Library,
  ListTodo,
  PackageOpen,
} from "lucide-react";

export interface SmartCanvasToolbarProps {
  title: string;
  dirty: boolean;
  assetOpen: boolean;
  onToggleAssets: () => void;
  onOpenTransfer: () => void;
  onOpenLogs: () => void;
  onOpenShortcuts: () => void;
}

function FloatBtn({
  title,
  testId,
  onClick,
  active,
  children,
  className = "",
}: {
  title: string;
  testId?: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-2 border px-3.5 text-xs font-semibold shadow-[0_14px_34px_var(--shadow)] backdrop-blur-md transition-[transform,border-color,background-color] hover:-translate-y-px ${
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border)] bg-[var(--bg)]/90 text-[var(--text)] hover:border-[var(--text)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * History-aligned floating chrome only:
 * left back + title; right 工作流 / 快捷键 / 日志 / 资产库.
 * Create lives in create menu + composer; canvas autosaves (Ctrl+S forces save).
 */
export function SmartCanvasToolbar({
  title,
  dirty,
  assetOpen,
  onToggleAssets,
  onOpenTransfer,
  onOpenLogs,
  onOpenShortcuts,
}: SmartCanvasToolbarProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="smart-canvas-toolbar">
      <Link
        to="/canvases"
        className="pointer-events-auto absolute left-[22px] top-[22px] z-20 flex h-10 items-center gap-2 border border-[var(--border)] bg-[var(--bg)]/90 px-3.5 text-xs font-semibold shadow-[0_16px_40px_var(--shadow)] backdrop-blur-md hover:-translate-y-px"
        aria-label="返回画布列表"
        title="返回画布列表"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>返回画布列表</span>
      </Link>
      <div
        className="pointer-events-none absolute left-[22px] top-[72px] z-10 max-w-[min(420px,calc(100vw-44px))] truncate text-xs font-semibold text-[var(--muted)]"
        title={title}
      >
        {title}
        {dirty ? (
          <span className="ml-2 text-[10px] font-medium" data-testid="smart-dirty-badge">
            · 未保存
          </span>
        ) : null}
      </div>

      <div className="pointer-events-auto absolute right-[22px] top-[22px] z-[56] flex items-center gap-2">
        <FloatBtn
          title="导入 / 导出工作流"
          testId="workflow-transfer-btn"
          onClick={onOpenTransfer}
          className="min-w-[96px]"
        >
          <PackageOpen className="h-4 w-4" />
          <span className="hidden sm:inline">工作流</span>
        </FloatBtn>
        <FloatBtn
          title="快捷键"
          testId="shortcuts-btn"
          onClick={onOpenShortcuts}
          className="min-w-[96px]"
        >
          <Keyboard className="h-4 w-4" />
          <span className="hidden sm:inline">快捷键</span>
        </FloatBtn>
        <FloatBtn title="生成日志" testId="logs-btn" onClick={onOpenLogs} className="min-w-[96px]">
          <ListTodo className="h-4 w-4" />
          <span className="hidden sm:inline">日志</span>
        </FloatBtn>
        <FloatBtn
          title="资产库"
          testId="assets-btn"
          onClick={onToggleAssets}
          active={assetOpen}
          className="min-w-[96px]"
        >
          <Library className="h-4 w-4" />
          <span className="hidden sm:inline">资产库</span>
        </FloatBtn>
      </div>
    </div>
  );
}
