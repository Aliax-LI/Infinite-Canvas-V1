import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Clapperboard,
  CloudLightning,
  CircleDot,
  Film,
  ImagePlus,
  MessageSquareText,
  Repeat2,
  TextCursorInput,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { LegacyNodeKind } from "../core/types";

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  onClose: () => void;
  onCreate: (kind: LegacyNodeKind, x: number, y: number) => void;
}

/** History create-menu order (no group — group lives on the top toolbar). */
const MENU_ITEMS: Array<{
  kind: LegacyNodeKind;
  icon: typeof ImagePlus;
  labelKey: string;
  labelFallback: string;
}> = [
  { kind: "image", icon: ImagePlus, labelKey: "imageCard", labelFallback: "上传节点" },
  { kind: "prompt", icon: TextCursorInput, labelKey: "prompt", labelFallback: "提示词" },
  { kind: "loop", icon: Repeat2, labelKey: "loopNode", labelFallback: "循环节点" },
  { kind: "llm", icon: MessageSquareText, labelKey: "llmNode", labelFallback: "LLM 节点" },
  { kind: "generator", icon: WandSparkles, labelKey: "apiGenerate", labelFallback: "API生成" },
  { kind: "msgen", icon: CloudLightning, labelKey: "modelscopeGenerate", labelFallback: "Modelscope生成" },
  { kind: "video", icon: Clapperboard, labelKey: "videoGenerateNode", labelFallback: "视频生成" },
  { kind: "rh", icon: Workflow, labelKey: "rhGenerate", labelFallback: "RH生成" },
  { kind: "comfy", icon: Workflow, labelKey: "comfyGenerate", labelFallback: "ComfyUI 生成" },
  { kind: "ltxDirector", icon: Film, labelKey: "ltxDirector", labelFallback: "LTX Director" },
  { kind: "output", icon: CircleDot, labelKey: "output", labelFallback: "Output" },
];

export function ContextMenu({
  open,
  x,
  y,
  worldX,
  worldY,
  onClose,
  onCreate,
}: ContextMenuProps) {
  const { t } = useTranslation("canvas");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menuW = 190;
  const left = Math.max(14, Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x) - menuW - 14));
  const top = Math.max(14, Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y) - 320));

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[190px] border border-[var(--border)] bg-[var(--bg)]/95 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.14)] backdrop-blur-md"
      style={{ left, top }}
      data-testid="legacy-context-menu"
    >
      {MENU_ITEMS.map(({ kind, icon: Icon, labelKey, labelFallback }) => (
        <button
          key={kind}
          type="button"
          className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-[var(--nav-hover-bg)]"
          data-testid={`legacy-context-menu-${kind}`}
          onClick={() => {
            onCreate(kind, worldX, worldY);
            onClose();
          }}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{t(labelKey, { defaultValue: labelFallback })}</span>
        </button>
      ))}
    </div>
  );
}
