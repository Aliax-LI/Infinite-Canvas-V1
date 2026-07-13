import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  CloudLightning,
  CircleDot,
  Film,
  Group,
  ImagePlus,
  Keyboard,
  Library,
  ListTodo,
  LocateFixed,
  MessageSquareText,
  PackageOpen,
  Repeat2,
  Scissors,
  TextCursorInput,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { LegacyNodeKind } from "../core/types";

export type LegacyCreateAction =
  | { type: "create"; kind: LegacyNodeKind }
  | { type: "group" };

interface LegacyCreateToolbarProps {
  title: string;
  updatedAt?: number;
  dirty: boolean;
  assetOpen: boolean;
  knifeMode: boolean;
  selectedCount: number;
  connectFeedback?: string;
  onClearConnectFeedback?: () => void;
  onCancelConnect?: () => void;
  connecting?: boolean;
  onCreate: (kind: LegacyNodeKind) => void;
  onGroup: () => void;
  onToggleAssets: () => void;
  onOpenLogs: () => void;
  onOpenWorkflow: () => void;
  onOpenShortcuts: () => void;
  onToggleKnife: () => void;
  onFit: () => void;
}

function formatCanvasTime(ts?: number) {
  if (!ts) return "--";
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  if (Number.isNaN(d.getTime())) return "--";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

const createItems: Array<{
  action: LegacyCreateAction;
  icon: typeof ImagePlus;
  labelKey: string;
  labelFallback: string;
  testId: string;
}> = [
  { action: { type: "create", kind: "image" }, icon: ImagePlus, labelKey: "image", labelFallback: "上传", testId: "legacy-create-image" },
  { action: { type: "create", kind: "prompt" }, icon: TextCursorInput, labelKey: "prompt", labelFallback: "提示词", testId: "legacy-create-prompt" },
  { action: { type: "create", kind: "loop" }, icon: Repeat2, labelKey: "loop", labelFallback: "循环", testId: "legacy-create-loop" },
  { action: { type: "create", kind: "llm" }, icon: MessageSquareText, labelKey: "llm", labelFallback: "LLM", testId: "legacy-create-llm" },
  { action: { type: "create", kind: "generator" }, icon: WandSparkles, labelKey: "apiGenerate", labelFallback: "API生成", testId: "legacy-create-generator" },
  { action: { type: "create", kind: "msgen" }, icon: CloudLightning, labelKey: "msGenerate", labelFallback: "Modelscope生成", testId: "legacy-create-msgen" },
  { action: { type: "create", kind: "video" }, icon: Clapperboard, labelKey: "videoGenerate", labelFallback: "视频生成", testId: "legacy-create-video" },
  { action: { type: "create", kind: "rh" }, icon: Workflow, labelKey: "rhGenerate", labelFallback: "RH生成", testId: "legacy-create-rh" },
  { action: { type: "create", kind: "comfy" }, icon: Workflow, labelKey: "comfyGenerate", labelFallback: "ComfyUI", testId: "legacy-create-comfy" },
  { action: { type: "create", kind: "ltxDirector" }, icon: Film, labelKey: "ltxDirector", labelFallback: "LTX Director", testId: "legacy-create-ltx" },
  { action: { type: "create", kind: "output" }, icon: CircleDot, labelKey: "output", labelFallback: "Output", testId: "legacy-create-output" },
  { action: { type: "group" }, icon: Group, labelKey: "group", labelFallback: "分组", testId: "legacy-create-group" },
];

function ToolBtn({
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
      className={`flex h-9 shrink-0 items-center gap-1.5 border px-2.5 text-[11px] font-semibold whitespace-nowrap transition-[transform,border-color,background-color] hover:-translate-y-px ${
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border)] bg-[var(--bg)]/95 text-[var(--text)] hover:border-[var(--text)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * History-aligned floating chrome for classic canvas:
 * left nav (back + title + time), right create toolbar + 工作流/资产库/日志.
 */
export function LegacyCreateToolbar({
  title,
  updatedAt,
  dirty,
  assetOpen,
  knifeMode,
  selectedCount,
  connectFeedback,
  onClearConnectFeedback,
  onCancelConnect,
  connecting,
  onCreate,
  onGroup,
  onToggleAssets,
  onOpenLogs,
  onOpenWorkflow,
  onOpenShortcuts,
  onToggleKnife,
  onFit,
}: LegacyCreateToolbarProps) {
  const { t } = useTranslation("canvas");
  // History `#quickToolbar` starts with class `collapsed`.
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="legacy-create-toolbar">
      {/* Left nav chip */}
      <div
        className="pointer-events-auto absolute left-[22px] top-[22px] z-20 flex max-w-[min(360px,calc(100vw-48px))] items-center gap-2 border border-[var(--border)] bg-[var(--bg)]/95 p-2 shadow-[0_14px_34px_var(--shadow)] backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Link
          to="/canvases"
          className="flex h-8 w-8 items-center justify-center border border-[var(--border)] hover:border-[var(--text)]"
          aria-label={t("backToList")}
          title={t("backToList")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-extrabold" title={title}>
            {title}
            {dirty ? (
              <span className="ml-1 text-[10px] font-medium text-[var(--muted)]" data-testid="legacy-dirty-badge">
                · 未保存
              </span>
            ) : null}
          </div>
          <div className="text-[10px] font-semibold text-[var(--muted)]" data-testid="legacy-canvas-time">
            {formatCanvasTime(updatedAt)}
            {selectedCount > 1 ? (
              <span className="ml-2" data-testid="legacy-multi-select-count">
                {t("multiSelect.count", { count: selectedCount })}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Right create + fixed */}
      <div
        className="pointer-events-auto absolute right-[22px] top-[22px] z-20 flex max-w-[calc(100vw-200px)] items-center gap-2 border border-[var(--border)] bg-[var(--bg)]/95 p-1.5 shadow-[0_14px_34px_var(--shadow)] backdrop-blur-md"
        data-testid="legacy-quick-toolbar"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--border)] hover:border-[var(--text)]"
          title={collapsed ? t("quickToolbarExpand") : t("quickToolbarCollapse")}
          data-testid="legacy-toolbar-toggle"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none" data-testid="legacy-toolbar-items">
            {createItems.map(({ action, icon: Icon, labelKey, labelFallback, testId }) => (
              <ToolBtn
                key={testId}
                title={t(labelKey, { defaultValue: labelFallback })}
                testId={testId}
                onClick={() => {
                  if (action.type === "group") onGroup();
                  else onCreate(action.kind);
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t(labelKey, { defaultValue: labelFallback })}</span>
              </ToolBtn>
            ))}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-1.5 border-l border-[var(--border)] pl-2">
          <ToolBtn title={t("exportWorkflow")} testId="legacy-export-workflow-btn" onClick={onOpenWorkflow}>
            <PackageOpen className="h-3.5 w-3.5" />
            <span>工作流</span>
          </ToolBtn>
          <ToolBtn
            title={t("assetLibrary")}
            testId="legacy-asset-btn"
            onClick={onToggleAssets}
            active={assetOpen}
          >
            <Library className="h-3.5 w-3.5" />
            <span>{t("assetLibrary")}</span>
          </ToolBtn>
          <ToolBtn title={t("logs")} testId="legacy-log-btn" onClick={onOpenLogs}>
            <ListTodo className="h-3.5 w-3.5" />
            <span>{t("logs")}</span>
          </ToolBtn>
        </div>
      </div>

      {/* Secondary edit cluster — bottom-left */}
      <div
        className="pointer-events-auto absolute bottom-6 left-[22px] z-20 flex items-center gap-0.5 border border-[var(--border)] bg-[var(--bg)]/95 p-1 shadow-[0_14px_34px_var(--shadow)] backdrop-blur-md"
        data-testid="legacy-edit-cluster"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={t("knifeMode")}
          data-testid="legacy-knife-btn"
          onClick={onToggleKnife}
          className={`rounded p-1.5 ${knifeMode ? "bg-red-600 text-white" : "hover:bg-[var(--nav-hover-bg)]"}`}
        >
          <Scissors className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t("shortcuts.title")}
          data-testid="legacy-shortcuts-btn"
          onClick={onOpenShortcuts}
          className="rounded p-1.5 hover:bg-[var(--nav-hover-bg)]"
        >
          <Keyboard className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t("generatePanel.fitViewport")}
          data-testid="legacy-fit-btn"
          onClick={onFit}
          className="rounded p-1.5 hover:bg-[var(--nav-hover-bg)]"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
        {connecting ? (
          <button
            type="button"
            onClick={onCancelConnect}
            className="ml-1 border border-[var(--border)] px-2 py-1 text-[10px]"
            data-testid="legacy-cancel-connect"
          >
            取消连接
          </button>
        ) : null}
        {connectFeedback ? (
          <button
            type="button"
            className="ml-1 max-w-[160px] truncate text-[10px] text-red-600"
            data-testid="legacy-connect-feedback"
            title={connectFeedback}
            onClick={onClearConnectFeedback}
          >
            {connectFeedback}
          </button>
        ) : null}
      </div>
    </div>
  );
}
