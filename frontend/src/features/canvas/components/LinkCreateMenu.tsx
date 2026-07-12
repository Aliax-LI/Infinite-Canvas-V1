import { useTranslation } from "react-i18next";
import type { LinkCreateOption } from "../core/linkCreate";

interface LinkCreateMenuProps {
  screenX: number;
  screenY: number;
  options: LinkCreateOption[];
  onPick: (kind: string) => void;
  onClose: () => void;
}

export function LinkCreateMenu({
  screenX,
  screenY,
  options,
  onPick,
  onClose,
}: LinkCreateMenuProps) {
  const { t } = useTranslation("canvas");

  if (!options.length) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        data-testid="link-create-backdrop"
        onClick={onClose}
      />
      <div
        className="fixed z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        style={{ left: screenX, top: screenY }}
        data-testid="link-create-menu"
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-black"
            data-testid={`link-create-${opt.kind}`}
            onClick={() => onPick(opt.kind)}
          >
            {t(opt.labelKey, { defaultValue: opt.defaultLabel })}
          </button>
        ))}
      </div>
    </>
  );
}
