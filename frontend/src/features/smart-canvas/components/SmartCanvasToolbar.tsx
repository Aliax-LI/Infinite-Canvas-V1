import { Link } from "react-router-dom";
import {
  ArrowLeft,
  FolderOpen,
  ImagePlus,
  Keyboard,
  LayoutGrid,
  Library,
  Link2,
  PackageOpen,
  Redo2,
  Save,
  ScrollText,
  Undo2,
  Workflow,
} from "lucide-react";

export interface SmartCanvasToolbarProps {
  title: string;
  dirty: boolean;
  saving: boolean;
  connectMode: boolean;
  assetOpen: boolean;
  templateOpen: boolean;
  workflowOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onArrange: () => void;
  onToggleConnect: () => void;
  onToggleAssets: () => void;
  onToggleTemplates: () => void;
  onToggleWorkflowPicker: () => void;
  onOpenTransfer: () => void;
  onAddImportNode: () => void;
  onOpenCreateMenu: (clientX: number, clientY: number) => void;
  onOpenLogs: () => void;
  onOpenShortcuts: () => void;
  onSave: () => void;
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-gray-200" aria-hidden />;
}

function ToolBtn({
  title,
  testId,
  onClick,
  active,
  children,
  onContextMenu,
}: {
  title: string;
  testId?: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`rounded-lg p-2 transition-colors ${
        active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Smart canvas top bar — history-aligned, no duplicate Upload icons.
 * Groups: Edit | Layout/Connect | Assets | Create | Meta | Save
 */
export function SmartCanvasToolbar({
  title,
  dirty,
  saving,
  connectMode,
  assetOpen,
  templateOpen,
  workflowOpen,
  onUndo,
  onRedo,
  onArrange,
  onToggleConnect,
  onToggleAssets,
  onToggleTemplates,
  onToggleWorkflowPicker,
  onOpenTransfer,
  onAddImportNode,
  onOpenCreateMenu,
  onOpenLogs,
  onOpenShortcuts,
  onSave,
}: SmartCanvasToolbarProps) {
  return (
    <header
      className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white"
      data-testid="smart-canvas-toolbar"
    >
      <Link
        to="/canvases"
        className="rounded-lg p-2 text-gray-700 hover:bg-gray-50"
        aria-label="返回画布列表"
        title="返回画布列表"
      >
        <ArrowLeft className="w-4 h-4" />
      </Link>
      <h1 className="font-medium font-serif flex-1 truncate min-w-0 px-1">{title}</h1>
      {dirty ? (
        <span className="text-[10px] text-gray-400 mr-1 shrink-0" data-testid="smart-dirty-badge">
          未保存
        </span>
      ) : null}

      {/* Edit */}
      <ToolBtn title="撤销 (Ctrl+Z)" testId="undo-btn" onClick={onUndo}>
        <Undo2 className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn title="重做 (Ctrl+Y)" testId="redo-btn" onClick={onRedo}>
        <Redo2 className="w-4 h-4" />
      </ToolBtn>

      <Divider />

      {/* Layout / connect */}
      <ToolBtn title="自动排列节点" testId="arrange-btn" onClick={onArrange}>
        <LayoutGrid className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn
        title={connectMode ? "退出连线模式" : "连线模式 (G)"}
        testId="connect-mode-btn"
        onClick={onToggleConnect}
        active={connectMode}
      >
        <Link2 className="w-4 h-4" />
      </ToolBtn>

      <Divider />

      {/* Assets / libraries */}
      <ToolBtn
        title="素材库"
        testId="assets-btn"
        onClick={onToggleAssets}
        active={assetOpen}
      >
        <FolderOpen className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn
        title="提示词模板库"
        testId="templates-btn"
        onClick={onToggleTemplates}
        active={templateOpen}
      >
        <Library className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn
        title="添加 RunningHub 工作流节点"
        testId="workflow-picker-btn"
        onClick={onToggleWorkflowPicker}
        active={workflowOpen}
      >
        <Workflow className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn
        title="导入 / 导出工作流"
        testId="workflow-transfer-btn"
        onClick={onOpenTransfer}
      >
        <PackageOpen className="w-4 h-4" />
      </ToolBtn>

      <Divider />

      {/* Create */}
      <ToolBtn
        title="添加导入节点（右键打开创建菜单）"
        testId="add-node-btn"
        onClick={onAddImportNode}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenCreateMenu(e.clientX, e.clientY);
        }}
      >
        <ImagePlus className="w-4 h-4" />
      </ToolBtn>

      <Divider />

      {/* Meta */}
      <ToolBtn title="生成日志" testId="logs-btn" onClick={onOpenLogs}>
        <ScrollText className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn title="快捷键" testId="shortcuts-btn" onClick={onOpenShortcuts}>
        <Keyboard className="w-4 h-4" />
      </ToolBtn>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        title={dirty ? "保存画布 (Ctrl+S)" : "已保存"}
        aria-label={saving ? "保存中" : dirty ? "保存" : "已保存"}
        className={`ml-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-serif font-medium transition-colors disabled:opacity-50 ${
          dirty
            ? "bg-black text-white hover:bg-gray-900"
            : "border border-gray-200 text-gray-700 hover:border-black"
        }`}
        data-testid="save-btn"
      >
        <Save className="w-4 h-4" />
        {saving ? "保存中" : dirty ? "保存*" : "已保存"}
      </button>
    </header>
  );
}
