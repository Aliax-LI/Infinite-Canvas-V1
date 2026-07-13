import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, X } from "lucide-react";
import {
  deleteKeyLabel,
  formatModShortcut,
} from "../../../shared/utils/platformShortcuts";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_KEYS = [
  "boxSelect",
  "group",
  "copy",
  "paste",
  "undo",
  "save",
  "delete",
  "zoomOverview",
  "pan",
  "wheelZoom",
  "contextMenu",
] as const;

type ShortcutKey = (typeof SHORTCUT_KEYS)[number];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const { t } = useTranslation("canvas");
  const keyLabels = useMemo((): Record<ShortcutKey, string> => {
    return {
      boxSelect: formatModShortcut([t("shortcuts.keys.drag")]),
      group: formatModShortcut(["G"]),
      copy: formatModShortcut(["C"]),
      paste: formatModShortcut(["V"]),
      undo: formatModShortcut(["Z"]),
      save: formatModShortcut(["S"]),
      delete: deleteKeyLabel(),
      zoomOverview: "Z",
      pan: t("shortcuts.keys.pan"),
      wheelZoom: t("shortcuts.keys.wheelZoom"),
      contextMenu: t("shortcuts.keys.contextMenu"),
    };
  }, [t]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end p-4 bg-black/30"
      onClick={onClose}
      data-testid="legacy-shortcuts-modal"
    >
      <div
        className="w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Keyboard className="w-4 h-4" />
            {t("shortcuts.title")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-50"
            aria-label={t("common.close", { ns: "studio", defaultValue: "Close" })}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="p-3 space-y-2 max-h-[70vh] overflow-auto">
          {SHORTCUT_KEYS.map((key) => (
            <li
              key={key}
              className="flex items-start justify-between gap-3 text-xs"
              data-testid={`legacy-shortcut-${key}`}
            >
              <span className="text-gray-600 flex-1">{t(`shortcuts.${key}`)}</span>
              <kbd className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-gray-50 text-gray-700">
                {keyLabels[key]}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
