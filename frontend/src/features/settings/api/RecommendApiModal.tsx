import { Save, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { RecommendRegisterLinks } from "./KeyAcquisitionLinks";
import {
  protocolBadge,
  RECOMMEND_GROUPS,
  RECOMMENDED_PRESETS,
  type RecommendedPreset,
} from "./recommendedPresets";

interface RecommendApiModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (preset: RecommendedPreset, apiKey?: string) => void;
  saving?: boolean;
}

export function RecommendApiModal({ open, onClose, onApply, saving }: RecommendApiModalProps) {
  const { t } = useTranslation("api-settings");
  const [keys, setKeys] = useState<Record<string, string>>({});

  const handleClose = useCallback(() => {
    setKeys({});
    onClose();
  }, [onClose]);

  useEscapeKey(open, handleClose);

  if (!open) return null;

  const applyPreset = (preset: RecommendedPreset) => {
    const key = keys[preset.id]?.trim();
    onApply(preset, key || undefined);
    setKeys((prev) => {
      const next = { ...prev };
      delete next[preset.id];
      return next;
    });
  };

  return (
    <div
      className="studio-picker-overlay"
      data-testid="provider-recommend-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="studio-picker-modal studio-recommend-modal" role="dialog" aria-modal="true">
        <div className="studio-picker-head">
          <div>
            <div className="studio-picker-title">{t("recommendPanelTitle")}</div>
            <div className="studio-picker-desc">{t("recommendPanelSub")}</div>
          </div>
          <button type="button" className="studio-icon-btn" onClick={handleClose} aria-label="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="studio-recommend-groups">
          {RECOMMEND_GROUPS.map((group) => {
            const items = RECOMMENDED_PRESETS.filter((p) => p.category === group.key);
            if (!items.length) return null;
            return (
              <section key={group.key} className="studio-recommend-group" data-testid={`recommend-group-${group.key}`}>
                <div className="studio-recommend-group-head">{group.title}</div>
                <div className="studio-recommend-list">
                  {items.map((preset) => (
                    <article
                      key={preset.id}
                      className="studio-recommend-card-v2"
                      data-testid={`recommend-preset-${preset.id}`}
                    >
                      <header className="studio-recommend-card-head">
                        <div className="studio-recommend-card-main">
                          <div className="studio-recommend-name">{preset.name}</div>
                          <RecommendRegisterLinks
                            registerUrl={preset.register_url}
                            registerUrlCn={preset.register_url_cn}
                            presetId={preset.id}
                          />
                          <span className="studio-recommend-badge">{protocolBadge(preset.protocol)}</span>
                        </div>
                        <button
                          type="button"
                          className="studio-action-btn primary-soft"
                          disabled={saving}
                          onClick={() => applyPreset(preset)}
                          data-testid={`recommend-save-${preset.id}`}
                        >
                          <Save className="w-3.5 h-3.5" />
                          保存
                        </button>
                      </header>
                      <p className="studio-recommend-summary">{preset.summary}</p>
                      {preset.tags.length > 0 && (
                        <div className="studio-recommend-tags">
                          {preset.tags.map((tag) => (
                            <span key={tag} className="studio-recommend-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="studio-recommend-url">{preset.base_url}</div>
                      <div className="studio-recommend-key-row">
                        <input
                          type="password"
                          value={keys[preset.id] ?? ""}
                          placeholder={`${preset.name} API Key（可选）`}
                          onChange={(e) =>
                            setKeys((prev) => ({ ...prev, [preset.id]: e.target.value }))
                          }
                          data-testid={`recommend-key-${preset.id}`}
                        />
                        {preset.keyHint && (
                          <span className="studio-field-hint">{preset.keyHint}</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <p className="studio-field-hint">{t("recommendApiNote")}</p>
      </div>
    </div>
  );
}
