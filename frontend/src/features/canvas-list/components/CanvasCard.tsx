import { useEffect, useRef, useState } from "react";
import {
  Download,
  MoreHorizontal,
  Pencil,
  Scissors,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, formatTime } from "../../../shared/utils";
import type { CanvasRecord } from "../../../types/api";

export interface CardContextMenuState {
  canvasId: string;
  x: number;
  y: number;
}

interface CanvasCardProps {
  canvas: CanvasRecord;
  cutId: string | null;
  confirmingDelete: boolean;
  onOpen: (id: string) => void;
  onMenu: (canvasId: string, anchor: DOMRect) => void;
  onDragEnd: (id: string, board_x: number, board_y: number) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  scale: number;
}

export function CanvasCard({
  canvas,
  cutId,
  confirmingDelete,
  onOpen,
  onMenu,
  onDragEnd,
  onConfirmDelete,
  onCancelDelete,
  screenToWorld,
  scale,
}: CanvasCardProps) {
  const { t } = useTranslation("canvas");
  const isSmart = (canvas.kind || "classic") === "smart";
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-card-menu]")) return;
    if ((e.target as HTMLElement).closest("[data-delete-confirm]")) return;
    e.stopPropagation();

    const startWorld = screenToWorld(e.clientX, e.clientY);
    const origX = canvas.board_x ?? 0;
    const origY = canvas.board_y ?? 0;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const dx = w.x - startWorld.x;
      const dy = w.y - startWorld.y;
      if (
        !moved &&
        (Math.abs(dx * scale) > 5 || Math.abs(dy * scale) > 5)
      ) {
        moved = true;
        cardRef.current?.classList.add("opacity-80", "shadow-lg");
      }
      if (moved && cardRef.current) {
        cardRef.current.style.left = `${origX + dx}px`;
        cardRef.current.style.top = `${origY + dy}px`;
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      cardRef.current?.classList.remove("opacity-80", "shadow-lg");
      if (moved) {
        const el = cardRef.current;
        const x = parseFloat(el?.style.left || "0");
        const y = parseFloat(el?.style.top || "0");
        onDragEnd(canvas.id, Math.round(x), Math.round(y));
      } else {
        onOpen(canvas.id);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "absolute w-[248px] border border-gray-200 rounded-lg bg-white p-4 cursor-pointer select-none transition-shadow hover:border-gray-300 hover:shadow-sm",
        cutId === canvas.id && "opacity-60 border-dashed",
        canvas.color && "ring-1 ring-inset ring-gray-300",
      )}
      style={{
        left: canvas.board_x ?? 0,
        top: canvas.board_y ?? 0,
      }}
      onMouseDown={handleMouseDown}
      data-testid={`canvas-card-${canvas.id}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
            isSmart ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600",
          )}
        >
          {isSmart ? t("smartCanvasShort") : t("legacyCanvas")}
        </span>
        <button
          type="button"
          data-card-menu
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onMenu(canvas.id, rect);
          }}
          aria-label={t("editMeta")}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <h3 className="font-medium text-sm truncate mb-2">{canvas.title}</h3>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <span>{canvas.node_count ?? 0}</span>
        <span className="text-gray-300">·</span>
        <span>{formatTime(canvas.updated_at || canvas.created_at)}</span>
      </p>

      {confirmingDelete ? (
        <div
          data-delete-confirm
          className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center p-4 text-center"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-sm mb-3">{t("moveToTrashConfirm")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg"
              onClick={() => onConfirmDelete(canvas.id)}
            >
              {t("moveToTrash")}
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg"
              onClick={onCancelDelete}
            >
              {t("reset")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface CardContextMenuProps {
  menu: CardContextMenuState | null;
  onClose: () => void;
  onRename: (id: string) => void;
  onExport: (id: string) => void;
  onExportWithAssets?: (id: string) => void;
  onCut: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CardContextMenu({
  menu,
  onClose,
  onRename,
  onExport,
  onExportWithAssets,
  onCut,
  onDelete,
}: CardContextMenuProps) {
  const { t } = useTranslation("canvas");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      style={{ left: menu.x, top: menu.y }}
      data-testid="canvas-card-menu"
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
        onClick={() => {
          onRename(menu.canvasId);
          onClose();
        }}
      >
        <Pencil className="w-4 h-4" />
        {t("rename")}
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
        onClick={() => {
          onExport(menu.canvasId);
          onClose();
        }}
      >
        <Download className="w-4 h-4" />
        {t("download")}
      </button>
      {onExportWithAssets ? (
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
          onClick={() => {
            onExportWithAssets(menu.canvasId);
            onClose();
          }}
          data-testid="canvas-export-with-assets"
        >
          <Download className="w-4 h-4" />
          {t("exportWithAssets")}
        </button>
      ) : null}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
        onClick={() => {
          onCut(menu.canvasId);
          onClose();
        }}
      >
        <Scissors className="w-4 h-4" />
        剪切到其他项�?
      </button>
      <div className="my-1 border-t border-gray-100" />
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600 text-left"
        onClick={() => {
          onDelete(menu.canvasId);
          onClose();
        }}
      >
        <Trash2 className="w-4 h-4" />
        {t("moveToTrash")}
      </button>
    </div>
  );
}

interface CreateCanvasPopoverProps {
  worldX: number;
  worldY: number;
  onCreate: (title: string, kind: "smart" | "classic") => void;
  onCancel: () => void;
}

export function CreateCanvasPopover({
  worldX,
  worldY,
  onCreate,
  onCancel,
}: CreateCanvasPopoverProps) {
  const { t } = useTranslation("canvas");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"smart" | "classic">("classic");

  return (
    <div
      className="absolute w-64 border border-gray-200 rounded-lg bg-white p-4 shadow-lg z-10"
      style={{ left: worldX, top: worldY }}
      onMouseDown={(e) => e.stopPropagation()}
      data-testid="create-canvas-popover"
    >
      <p className="text-sm font-medium mb-2">{t("newCanvas")}</p>
      <input
        type="text"
        maxLength={80}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("newCanvasPlaceholder")}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:border-black outline-none"
        autoFocus
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") onCreate(title.trim(), kind);
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-1 mb-2 p-0.5 bg-gray-100 rounded-lg">
        <button
          type="button"
          className={cn(
            "flex-1 text-xs py-1.5 rounded-md transition-colors",
            kind === "classic" ? "bg-white shadow-sm font-medium" : "text-gray-600",
          )}
          onClick={() => setKind("classic")}
        >
          {t("legacyCanvas")}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 text-xs py-1.5 rounded-md transition-colors",
            kind === "smart" ? "bg-white shadow-sm font-medium" : "text-gray-600",
          )}
          onClick={() => setKind("smart")}
        >
          {t("smartCanvasShort")}
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        {kind === "smart" ? t("canvasKindSmartDesc") : t("canvasKindClassicDesc")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 py-1.5 text-sm bg-black text-white rounded-lg hover:bg-gray-900"
          onClick={() => onCreate(title.trim(), kind)}
        >
          {t("add")}
        </button>
        <button
          type="button"
          className="flex-1 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-black"
          onClick={onCancel}
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}

interface RenameCanvasInlineProps {
  canvasId: string;
  initialTitle: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}

export function RenameCanvasInline({
  canvasId,
  initialTitle,
  onSave,
  onCancel,
}: RenameCanvasInlineProps) {
  const [value, setValue] = useState(initialTitle);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      data-testid="rename-canvas-modal"
    >
      <div className="bg-white rounded-lg p-4 w-80 shadow-xl">
        <input
          type="text"
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:border-black outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(value.trim());
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm bg-black text-white rounded-lg"
            onClick={() => onSave(value.trim())}
            data-testid={`rename-save-${canvasId}`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
