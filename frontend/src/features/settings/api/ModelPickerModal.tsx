import { Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import {
  applyModelPickerState,
  buildModelPickerState,
  countPickerStats,
  type FetchedModels,
  type ModelPickerState,
  type ModelPickerTab,
  type ProviderModels,
} from "./modelPickerState";

interface ModelPickerModalProps {
  open: boolean;
  fetched: FetchedModels | null;
  existing: ProviderModels;
  initialTab?: ModelPickerTab;
  onClose: () => void;
  onApply: (models: ProviderModels) => void;
}

const TABS: { id: ModelPickerTab; labelKey: string }[] = [
  { id: "all", labelKey: "modelPickerTabAll" },
  { id: "image", labelKey: "modelPickerTabImage" },
  { id: "chat", labelKey: "modelPickerTabChat" },
  { id: "video", labelKey: "modelPickerTabVideo" },
];

export function ModelPickerModal({
  open,
  fetched,
  existing,
  initialTab = "all",
  onClose,
  onApply,
}: ModelPickerModalProps) {
  const { t } = useTranslation("api-settings");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<ModelPickerTab>("all");
  const [state, setState] = useState<ModelPickerState>({ category: {}, selected: {} });

  useEffect(() => {
    if (!open || !fetched) return;
    setState(buildModelPickerState(fetched, existing));
    setFilter("");
    setTab(initialTab);
  }, [open, fetched, existing, initialTab]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEscapeKey(open, handleClose);

  const { totals, selecteds } = useMemo(() => countPickerStats(state), [state]);

  const visibleIds = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return Object.keys(state.category)
      .sort()
      .filter((id) => {
        if (needle && !id.toLowerCase().includes(needle)) return false;
        if (tab === "all") return true;
        return state.category[id] === tab;
      });
  }, [state, filter, tab]);

  if (!open || !fetched) return null;

  const toggleRow = (id: string) => {
    setState((prev) => ({
      ...prev,
      selected: { ...prev.selected, [id]: !prev.selected[id] },
    }));
  };

  const handleApply = () => {
    onApply(applyModelPickerState(state));
    onClose();
  };

  return (
    <div
      className="studio-picker-overlay"
      data-testid="provider-model-picker-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="studio-picker-modal studio-model-picker-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="studio-picker-head">
          <div>
            <div className="studio-picker-title">{t("modelPickerTitle")}</div>
            <div className="studio-picker-desc" data-testid="model-picker-count">
              {t("modelPickerCount", {
                total: totals.all,
                visible: visibleIds.length,
              })}
            </div>
          </div>
          <button
            type="button"
            className="studio-icon-btn"
            onClick={handleClose}
            aria-label={t("modelPickerCancel")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="studio-model-picker-toolbar">
          <input
            className="studio-model-picker-search"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("modelPickerSearch")}
            data-testid="model-picker-filter"
          />
          <div className="studio-model-picker-tabs">
            {TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                className={`studio-model-picker-tab${tab === id ? " active" : ""}`}
                onClick={() => setTab(id)}
                data-testid={`model-picker-tab-${id}`}
              >
                {t(labelKey)}
                <span className="studio-model-picker-tab-count">
                  {selecteds[id]}/{totals[id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="studio-model-picker-body" data-testid="model-picker-list">
          {visibleIds.length === 0 ? (
            <div className="studio-model-picker-empty">{t("modelPickerEmpty")}</div>
          ) : (
            visibleIds.map((id) => {
              const checked = state.selected[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`studio-model-picker-row${checked ? " has-sel" : ""}`}
                  onClick={() => toggleRow(id)}
                  data-testid={`model-picker-row-${id}`}
                >
                  <span className={`studio-model-picker-checkbox${checked ? " checked" : ""}`}>
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="studio-model-picker-name" title={id}>
                    {id}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="studio-model-picker-summary" data-testid="model-picker-summary">
          <span className="studio-model-picker-summary-title">{t("modelPickerSummary")}</span>
          <span
            className={`studio-model-picker-chip${selecteds.image === 0 ? " empty" : ""}`}
            data-testid="model-picker-sum-image"
          >
            {t("modelPickerSumImage", { count: selecteds.image })}
          </span>
          <span
            className={`studio-model-picker-chip${selecteds.chat === 0 ? " empty" : ""}`}
            data-testid="model-picker-sum-chat"
          >
            {t("modelPickerSumChat", { count: selecteds.chat })}
          </span>
          <span
            className={`studio-model-picker-chip${selecteds.video === 0 ? " empty" : ""}`}
            data-testid="model-picker-sum-video"
          >
            {t("modelPickerSumVideo", { count: selecteds.video })}
          </span>
          <span className="studio-model-picker-unsel" data-testid="model-picker-sum-unsel">
            {t("modelPickerUnselected", { count: totals.all - selecteds.all })}
          </span>
        </div>

        <div className="studio-model-picker-foot">
          <button
            type="button"
            className="studio-action-btn"
            onClick={handleClose}
            data-testid="model-picker-cancel"
          >
            {t("modelPickerCancel")}
          </button>
          <button
            type="button"
            className="studio-action-btn primary"
            onClick={handleApply}
            data-testid="model-picker-apply"
          >
            {t("modelPickerApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
