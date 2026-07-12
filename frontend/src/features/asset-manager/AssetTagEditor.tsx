import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StudioDialog } from "../../shared/ui/StudioDialog";

interface AssetTagEditorProps {
  open: boolean;
  itemName?: string;
  initialTags: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}

function parseTagInput(value: string): string[] {
  return value
    .split(/[,，�?|;；\n]+/)
    .map((tag) => tag.trim().replace(/^[#＃]+/, ""))
    .filter(Boolean);
}

export function AssetTagEditor({
  open,
  itemName,
  initialTags,
  saving = false,
  onClose,
  onSave,
}: AssetTagEditorProps) {
  const { t } = useTranslation("assets");
  const [input, setInput] = useState("");

  useEffect(() => {
    if (open) setInput(initialTags.join(", "));
  }, [open, initialTags]);

  return (
    <StudioDialog
      open={open}
      title={t("tags.editTitle")}
      onClose={onClose}
      data-testid="asset-tag-editor"
    >
      {itemName ? (
        <p className="text-sm text-[var(--muted)] mb-3 truncate">{itemName}</p>
      ) : null}
      <label className="block text-sm mb-2" htmlFor="asset-tag-input">
        {t("tags.inputLabel")}
      </label>
      <textarea
        id="asset-tag-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-black focus:outline-none"
        placeholder={t("tags.inputPlaceholder")}
        data-testid="asset-tag-input"
      />
      <p className="text-xs text-[var(--muted)] mt-2">{t("tags.inputHint")}</p>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          className="studio-history-btn"
          onClick={onClose}
          disabled={saving}
        >
          {t("tags.cancel")}
        </button>
        <button
          type="button"
          className="studio-history-btn studio-history-btn--primary"
          onClick={() => onSave(parseTagInput(input))}
          disabled={saving}
          data-testid="asset-tag-save"
        >
          {saving ? t("tags.saving") : t("tags.save")}
        </button>
      </div>
    </StudioDialog>
  );
}
