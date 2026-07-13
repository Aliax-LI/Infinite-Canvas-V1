import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Group, MessageSquareText, Repeat2, UploadCloud } from "lucide-react";
import {
  createImageNode,
  createLoopNode,
  createPromptNode,
  createSmartGroupNode,
} from "../core/nodeFactory";

export type CreateKind = "image" | "group" | "prompt" | "loop";

interface CreateMenuProps {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onCreate: (kind: CreateKind, x: number, y: number) => void;
}

const itemDefs: {
  kind: CreateKind;
  labelKey: string;
  labelFallback: string;
  subKey: string;
  subFallback: string;
  icon: typeof UploadCloud;
}[] = [
  {
    kind: "image",
    labelKey: "createUpload",
    labelFallback: "上传",
    subKey: "createImportNodeSub",
    subFallback: "支持图片/音频/视频/批量上传",
    icon: UploadCloud,
  },
  {
    kind: "group",
    labelKey: "createGroup",
    labelFallback: "分组",
    subKey: "createGroupSub",
    subFallback: "把提示词、图片、循环收进同一组",
    icon: Group,
  },
  {
    kind: "prompt",
    labelKey: "createPrompt",
    labelFallback: "提示词",
    subKey: "createPromptSub",
    subFallback: "手写或用 LLM 生成文本",
    icon: MessageSquareText,
  },
  {
    kind: "loop",
    labelKey: "createLoop",
    labelFallback: "循环",
    subKey: "createLoopSub",
    subFallback: "控制运行轮数、批次和变量",
    icon: Repeat2,
  },
];

export function createNodeByKind(kind: CreateKind, x: number, y: number) {
  switch (kind) {
    case "prompt":
      return createPromptNode(x, y);
    case "loop":
      return createLoopNode(x, y);
    case "group":
      return createSmartGroupNode(x, y);
    default:
      return createImageNode({ x, y });
  }
}

export function CreateMenu({ open, x, y, onClose, onCreate }: CreateMenuProps) {
  const { t } = useTranslation("smart-canvas");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open) return null;

  const menuW = Math.min(500, typeof window !== "undefined" ? window.innerWidth - 28 : 500);
  const left = Math.max(14, Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x) - menuW - 14));
  const top = Math.max(14, Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y) - 140));

  return (
    <div
      ref={ref}
      className="fixed z-[75] border border-[var(--border)] bg-[var(--bg)]/95 p-2 shadow-[0_22px_58px_var(--shadow)] backdrop-blur-xl"
      style={{ left, top, width: menuW }}
      data-testid="create-menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-4 gap-2">
        {itemDefs.map(({ kind, labelKey, labelFallback, subKey, subFallback, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            className="flex min-h-24 flex-col items-start gap-2 border border-[var(--border)] bg-[var(--card,var(--bg))] p-2.5 text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[var(--text)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.1)]"
            data-testid={`create-menu-${kind}`}
            onClick={() => {
              onCreate(kind, x, y);
              onClose();
            }}
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--soft,var(--nav-hover-bg))]">
              <Icon className="h-[17px] w-[17px]" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[11.5px] font-extrabold leading-tight">
                {t(labelKey, { defaultValue: labelFallback })}
              </span>
              <span className="line-clamp-2 min-h-6 text-[9.5px] font-semibold leading-snug text-[var(--muted)]">
                {t(subKey, { defaultValue: subFallback })}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
