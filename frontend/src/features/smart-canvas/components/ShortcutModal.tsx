import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, X } from "lucide-react";
import {
  altKeyLabel,
  deleteKeyLabel,
  modKeyLabel,
} from "../../../shared/utils/platformShortcuts";

interface ShortcutModalProps {
  open: boolean;
  onClose: () => void;
}

type ShortcutEntry = {
  id: string;
  actionKey: string;
  keys: string[];
};

export function ShortcutModal({ open, onClose }: ShortcutModalProps) {
  const { t } = useTranslation("smart-canvas");

  const entries = useMemo((): ShortcutEntry[] => {
    const mod = modKeyLabel();
    const alt = altKeyLabel();
    return [
      { id: "boxSelect", actionKey: "shortcutBoxSelect", keys: [mod] },
      { id: "group", actionKey: "shortcutGroup", keys: [mod, "G"] },
      { id: "ungroup", actionKey: "shortcutUngroup", keys: [mod, "Shift", "G"] },
      { id: "undo", actionKey: "shortcutUndo", keys: [mod, "Z"] },
      { id: "redo", actionKey: "shortcutUndoAlt", keys: [mod, "Shift", "Z"] },
      { id: "save", actionKey: "shortcutSave", keys: [mod, "S"] },
      { id: "copy", actionKey: "shortcutCopy", keys: [mod, "C"] },
      { id: "paste", actionKey: "shortcutPaste", keys: [mod, "V"] },
      { id: "altCopy", actionKey: "shortcutAltCopy", keys: [alt] },
      { id: "altShiftCopy", actionKey: "shortcutAltShiftCopy", keys: [alt, "Shift"] },
      { id: "assets", actionKey: "shortcutAssets", keys: ["A"] },
      { id: "overview", actionKey: "shortcutOverview", keys: ["Z"] },
      { id: "createMenu", actionKey: "shortcutCreateMenu", keys: [t("keyDoubleClick")] },
      { id: "pan", actionKey: "shortcutPan", keys: [t("keyEmpty")] },
      { id: "zoom", actionKey: "shortcutZoom", keys: [t("keyWheel")] },
      { id: "delete", actionKey: "shortcutDelete", keys: [deleteKeyLabel()] },
    ];
  }, [t]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="shortcut-modal"
      role="dialog"
      aria-modal="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-md p-6"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-medium">
            <Keyboard className="h-4 w-4" />
            {t("shortcuts")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[var(--soft)]"
            aria-label={t("common.close", { ns: "studio", defaultValue: "Close" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-[70vh] space-y-2 overflow-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`smart-shortcut-${entry.id}`}
            >
              <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{t(entry.actionKey)}</span>
              <span className="flex shrink-0 gap-1">
                {entry.keys.map((key) => (
                  <kbd
                    key={`${entry.id}-${key}`}
                    className="inline-flex min-w-[1.75rem] items-center justify-center border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
