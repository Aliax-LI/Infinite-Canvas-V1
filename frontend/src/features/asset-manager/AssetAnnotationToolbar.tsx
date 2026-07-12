import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StudioSelect } from "../../shared/ui/StudioSelect";
import { useAssetAnnotationSettings } from "./useAssetAnnotationSettings";

export function AssetAnnotationToolbar() {
  const { t } = useTranslation("assets");
  const [promptOpen, setPromptOpen] = useState(false);
  const {
    providers,
    provider,
    model,
    prompt,
    modelOptions,
    isLoading,
    isSaving,
    updateProvider,
    updateModel,
    updatePrompt,
    savePrompt,
  } = useAssetAnnotationSettings();

  if (isLoading) {
    return (
      <div
        className="studio-asset-annotation-label"
        data-testid="asset-annotation-toolbar-loading"
      >
        {t("annotation.loading")}
      </div>
    );
  }

  if (!providers.length) {
    return (
      <p className="studio-asset-annotation-label max-w-xs" data-testid="asset-annotation-toolbar-empty">
        {t("annotation.noProviders")}
      </p>
    );
  }

  return (
    <div className="studio-asset-annotation" data-testid="asset-annotation-toolbar">
      <div className="studio-asset-annotation-row">
        <span className="studio-asset-annotation-label">
          <Sparkles aria-hidden />
          {t("annotation.label")}
        </span>
        <div className="studio-asset-annotation-field">
          <span className="studio-asset-annotation-field-label">{t("annotation.provider")}</span>
          <StudioSelect
            value={provider}
            onChange={updateProvider}
            options={providers.map((p) => ({ value: p.id, label: p.name || p.id }))}
            className="studio-asset-annotation-select"
            data-testid="asset-annotation-provider"
          />
        </div>
        <div className="studio-asset-annotation-field">
          <span className="studio-asset-annotation-field-label">{t("annotation.model")}</span>
          <StudioSelect
            value={model}
            onChange={updateModel}
            options={modelOptions.map((m) => ({ value: m, label: m }))}
            disabled={!modelOptions.length}
            className="studio-asset-annotation-select"
            data-testid="asset-annotation-model"
          />
        </div>
        <button
          type="button"
          onClick={() => setPromptOpen((open) => !open)}
          className="studio-action-btn"
          aria-expanded={promptOpen}
          data-testid="asset-annotation-prompt-toggle"
        >
          {t("annotation.prompt")}
          {promptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {isSaving ? (
          <span className="studio-asset-annotation-label" role="status">
            {t("annotation.saving")}
          </span>
        ) : null}
      </div>
      {promptOpen ? (
        <div className="studio-asset-annotation-prompt-panel">
          <textarea
            value={prompt}
            onChange={(e) => updatePrompt(e.target.value)}
            rows={3}
            placeholder={t("annotation.promptPlaceholder")}
            data-testid="asset-annotation-prompt"
          />
          <div className="studio-asset-annotation-prompt-actions">
            <button
              type="button"
              onClick={savePrompt}
              disabled={isSaving}
              className="studio-action-btn primary"
              data-testid="asset-annotation-prompt-save"
            >
              {isSaving ? t("annotation.saving") : t("annotation.savePrompt")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
