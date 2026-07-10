import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StudioSelect } from "../../../shared/ui/StudioSelect";
import { fetchMsLoraCatalog } from "./msLoraApi";
import {
  buildLoraIdOptions,
  buildLoraTargetOptions,
  createEmptyLora,
  LORA_ID_CUSTOM,
  normalizeLoraStrength,
  type LoraIdOption,
  type MsLora,
} from "./msLoraState";

const MODEL_LIBRARY_LINKS = {
  cn: "https://www.modelscope.cn/aigc/models",
  global: "https://www.modelscope.ai/civision/models",
} as const;

interface MsLoraManagerProps {
  loras: MsLora[];
  imageModels: string[];
  onChange: (loras: MsLora[]) => void;
}

function useLoraCatalog(targetModel: string) {
  return useQuery({
    queryKey: ["ms-lora-catalog", targetModel],
    queryFn: () => fetchMsLoraCatalog(targetModel),
    enabled: Boolean(targetModel),
    staleTime: 60_000,
  });
}

function LoraIdField({
  index,
  lora,
  rows,
  target,
  customIdRows,
  onCustomIdRowsChange,
  onUpdate,
}: {
  index: number;
  lora: MsLora;
  rows: MsLora[];
  target: string;
  customIdRows: Set<number>;
  onCustomIdRowsChange: (next: Set<number>) => void;
  onUpdate: (patch: Partial<MsLora>) => void;
}) {
  const { t } = useTranslation("api-settings");
  const catalogQuery = useLoraCatalog(target);
  const catalogOptions: LoraIdOption[] = (catalogQuery.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name === item.id ? item.id : `${item.name} (${item.id})`,
  }));
  const idOptions = buildLoraIdOptions(rows, lora.id, catalogOptions);
  const useCustomInput =
    customIdRows.has(index) ||
    (Boolean(lora.id) && !idOptions.some((option) => option.value === lora.id));
  const selectOptions = [...idOptions, { value: LORA_ID_CUSTOM, label: t("loraIdCustom") }];
  const placeholder = catalogQuery.isLoading
    ? t("loraCatalogLoading")
    : catalogQuery.isError
      ? t("loraCatalogLoadFailed")
      : t("loraIdSelectPlaceholder");

  const enableCustomIdInput = () => {
    onCustomIdRowsChange(new Set(customIdRows).add(index));
    onUpdate({ id: "", name: "" });
  };

  const disableCustomIdInput = () => {
    const next = new Set(customIdRows);
    next.delete(index);
    onCustomIdRowsChange(next);
    onUpdate({ id: "", name: "" });
  };

  const handleLoraIdSelect = (value: string) => {
    if (value === LORA_ID_CUSTOM) {
      enableCustomIdInput();
      return;
    }
    const next = new Set(customIdRows);
    next.delete(index);
    onCustomIdRowsChange(next);
    const catalogItem = catalogQuery.data?.items.find((item) => item.id === value);
    const existing = rows.find((item) => item.id === value);
    onUpdate({
      id: value,
      name: catalogItem?.name || existing?.name || value,
      target_model: existing?.target_model || lora.target_model,
    });
  };

  return (
    <div className="studio-lora-field studio-lora-field-id">
      <div className="studio-lora-field-head">
        <span className="studio-lora-field-label">{t("loraId")}</span>
        {target && catalogQuery.data && !catalogQuery.isLoading ? (
          <span className="studio-lora-catalog-hint" data-testid={`ms-lora-catalog-hint-${index}`}>
            {t("loraCatalogHint", {
              count: catalogQuery.data.items?.length ?? 0,
              total: catalogQuery.data.total ?? 0,
            })}
          </span>
        ) : catalogQuery.isLoading && target ? (
          <span className="studio-lora-catalog-hint" data-testid={`ms-lora-catalog-hint-${index}`}>
            {t("loraCatalogLoading")}
          </span>
        ) : null}
      </div>
      <div className="studio-lora-field-control">
        {useCustomInput ? (
          <div className="studio-lora-id-custom">
            <input
              value={lora.id}
              placeholder={t("loraIdPlaceholder")}
              onChange={(e) => onUpdate({ id: e.target.value, name: e.target.value.trim() })}
              data-testid={`ms-lora-id-input-${index}`}
            />
            <button
              type="button"
              className="studio-lora-id-back"
              onClick={disableCustomIdInput}
              data-testid={`ms-lora-id-preset-${index}`}
            >
              {t("loraIdFromCatalog")}
            </button>
          </div>
        ) : (
          <div className="studio-field-frame studio-lora-select-frame">
            <StudioSelect
              framed
              value={lora.id}
              placeholder={placeholder}
              disabled={!target || catalogQuery.isLoading}
              onChange={handleLoraIdSelect}
              options={selectOptions}
              data-testid={`ms-lora-id-${index}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function MsLoraManager({ loras, imageModels, onChange }: MsLoraManagerProps) {
  const { t } = useTranslation("api-settings");
  const rows = Array.isArray(loras) ? loras : [];
  const [customIdRows, setCustomIdRows] = useState<Set<number>>(() => new Set());

  const updateLora = (index: number, patch: Partial<MsLora>) => {
    const next = rows.map((lora, i) => (i === index ? { ...lora, ...patch } : lora));
    onChange(next);
  };

  const addLora = () => {
    onChange([...rows, createEmptyLora(imageModels)]);
  };

  const removeLora = (index: number) => {
    setCustomIdRows((prev) => {
      const next = new Set<number>();
      for (const rowIndex of prev) {
        if (rowIndex < index) next.add(rowIndex);
        else if (rowIndex > index) next.add(rowIndex - 1);
      }
      return next;
    });
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <section className="studio-block studio-ms-lora-block" data-testid="ms-lora-section">
      <div className="studio-block-head">
        <div>
          <div className="studio-block-title">{t("loraManager")}</div>
          <div className="studio-block-desc">{t("loraManagerDesc")}</div>
          <div className="studio-ms-model-links">
            <span className="studio-ms-model-link-line">
              <span>{t("msCnModels")}</span>
              <a href={MODEL_LIBRARY_LINKS.cn} target="_blank" rel="noreferrer">
                {MODEL_LIBRARY_LINKS.cn}
              </a>
            </span>
            <span className="studio-ms-model-link-line">
              <span>{t("msEnModels")}</span>
              <a href={MODEL_LIBRARY_LINKS.global} target="_blank" rel="noreferrer">
                {MODEL_LIBRARY_LINKS.global}
              </a>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="studio-ghost-btn"
          onClick={addLora}
          data-testid="ms-lora-add-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          LoRA
        </button>
      </div>

      <div className="studio-lora-list">
        {rows.length === 0 ? (
          <div className="studio-lora-empty" data-testid="ms-lora-empty">
            {t("loraEmpty")}
          </div>
        ) : (
          rows.map((lora, index) => {
            const target = lora.target_model || imageModels[0] || "";
            const targetOptions = buildLoraTargetOptions(imageModels, target);

            return (
              <div key={`lora-${index}`} className="studio-lora-row" data-testid={`ms-lora-row-${index}`}>
                <LoraIdField
                  index={index}
                  lora={lora}
                  rows={rows}
                  target={target}
                  customIdRows={customIdRows}
                  onCustomIdRowsChange={setCustomIdRows}
                  onUpdate={(patch) => updateLora(index, patch)}
                />
                <div className="studio-lora-field">
                  <span className="studio-lora-field-label">{t("loraTargetModel")}</span>
                  <div className="studio-lora-field-control">
                    <div className="studio-field-frame studio-lora-select-frame">
                      <StudioSelect
                        framed
                        value={target}
                        onChange={(value) => updateLora(index, { target_model: value })}
                        options={targetOptions.map((model) => ({ value: model, label: model }))}
                        data-testid={`ms-lora-target-${index}`}
                      />
                    </div>
                  </div>
                </div>
                <label className="studio-lora-field studio-lora-field-strength">
                  <span className="studio-lora-field-label">{t("loraDefaultStrength")}</span>
                  <div className="studio-lora-field-control">
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.05}
                      value={normalizeLoraStrength(lora.strength)}
                      onChange={(e) =>
                        updateLora(index, { strength: normalizeLoraStrength(e.target.value) })
                      }
                      data-testid={`ms-lora-strength-${index}`}
                    />
                  </div>
                </label>
                <button
                  type="button"
                  className="studio-icon-btn danger"
                  onClick={() => removeLora(index)}
                  title={t("delete")}
                  data-testid={`ms-lora-delete-${index}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
