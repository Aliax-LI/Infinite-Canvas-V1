import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../shared/api/client";
import type { PromptTemplate } from "../../../types/api";

interface LegacyPromptTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (content: string) => void;
}

export function LegacyPromptTemplateModal({
  open,
  onClose,
  onApply,
}: LegacyPromptTemplateModalProps) {
  const { t } = useTranslation("canvas");

  const { data: templates } = useQuery({
    queryKey: ["legacy-canvas-prompt-templates"],
    queryFn: () =>
      api.get<{ templates: PromptTemplate[] }>("/api/smart-canvas/prompt-templates"),
    enabled: open,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="legacy-prompt-template-modal"
    >
      <div className="w-full max-w-lg max-h-[80vh] rounded-xl border border-gray-200 bg-white shadow-lg flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-black">{t("promptTemplateLibrary")}</h3>
          <button type="button" className="p-1 rounded-lg hover:bg-gray-50" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-3">
          {(templates?.templates ?? []).length ? (
            (templates?.templates ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left rounded-lg border border-gray-200 p-3 mb-2 hover:border-black transition-colors"
                data-testid={`prompt-template-${item.id}`}
                onClick={() => {
                  onApply(item.content);
                  onClose();
                }}
              >
                <div className="text-sm font-medium text-black mb-1">{item.title}</div>
                <div className="text-xs text-gray-500 line-clamp-2">{item.content}</div>
              </button>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">{t("promptTemplateEmpty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
