import { Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../../shared/utils";
import {
  comfyAggregateLabel,
  comfyStatusLabel,
  normalizeComfyAddress,
  useComfyuiStatus,
} from "./useComfyuiStatus";

interface ComfyInstancesEditorProps {
  instances: string[];
  saving?: boolean;
  onSave: (instances: string[]) => void;
}

export function ComfyInstancesEditor({ instances, saving, onSave }: ComfyInstancesEditorProps) {
  const [rows, setRows] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setRows(instances.length ? [...instances] : [""]);
    }
  }, [instances, dirty]);

  const probeAddresses = useMemo(
    () => rows.map((row) => normalizeComfyAddress(row)).filter(Boolean),
    [rows],
  );
  const { data: statusData, isFetching, isLoading } = useComfyuiStatus(probeAddresses);
  const statusByAddress = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of statusData?.instances ?? []) {
      map.set(normalizeComfyAddress(item.address), item.online);
    }
    return map;
  }, [statusData]);

  const updateRow = (index: number, value: string) => {
    setDirty(true);
    setRows((prev) => prev.map((row, i) => (i === index ? value : row)));
  };

  const addRow = () => {
    setDirty(true);
    setRows((prev) => [...prev, ""]);
  };

  const removeRow = (index: number) => {
    setDirty(true);
    setRows((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const handleSave = () => {
    const cleaned = rows.map((s) => s.trim()).filter(Boolean);
    if (!cleaned.length) return;
    onSave(cleaned);
    setDirty(false);
  };

  const checking = isLoading || isFetching;
  const aggregateText = comfyAggregateLabel(
    statusData?.online_count ?? 0,
    statusData?.total ?? probeAddresses.length,
    checking,
  );

  return (
    <div className="studio-comfy-instances" data-testid="comfy-instances-editor">
      <div className="studio-comfy-instance-list">
        {rows.map((addr, index) => {
          const normalized = normalizeComfyAddress(addr);
          const online = normalized ? statusByAddress.get(normalized) : undefined;
          const statusText = normalized ? comfyStatusLabel(online, checking && online === undefined) : "";
          const dotClass = cn(
            "studio-comfy-status-dot",
            normalized && online === true && "online",
            normalized && online === false && "offline",
            normalized && online === undefined && checking && "checking",
          );

          return (
            <div key={index} className="studio-comfy-instance-row" data-testid={`comfy-instance-row-${index}`}>
              <span className="studio-comfy-instance-index">{index + 1}</span>
              {normalized ? (
                <span className="studio-comfy-status" data-testid={`comfy-instance-status-${index}`}>
                  <span className={dotClass} aria-hidden />
                  <span className="studio-comfy-status-label">{statusText}</span>
                </span>
              ) : (
                <span className="studio-comfy-status studio-comfy-status-placeholder" aria-hidden />
              )}
              <input
                type="text"
                value={addr}
                placeholder="127.0.0.1:8188"
                onChange={(e) => updateRow(index, e.target.value)}
                data-testid={`comfy-instance-input-${index}`}
              />
              <button
                type="button"
                className="studio-icon-btn danger"
                onClick={() => removeRow(index)}
                title="删除"
                data-testid={`comfy-instance-remove-${index}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="studio-comfy-instance-actions">
        <button
          type="button"
          className="studio-upload-btn studio-comfy-add-btn"
          onClick={addRow}
          data-testid="comfy-instance-add"
        >
          <Plus className="w-3.5 h-3.5" />
          添加后端
        </button>
        <div className="studio-comfy-save-row">
          {aggregateText ? (
            <span className="studio-comfy-aggregate-status" data-testid="comfy-aggregate-status">
              {aggregateText}
            </span>
          ) : null}
          <button
            type="button"
            className="studio-upload-btn studio-comfy-save-btn"
            onClick={handleSave}
            disabled={saving || !rows.some((s) => s.trim())}
            data-testid="comfy-save-btn"
          >
            <Save className="w-3.5 h-3.5" />
            保存
          </button>
        </div>
      </div>
      <p className="studio-field-hint">
        格式：<span className="studio-inline-code">host:port</span>
        {probeAddresses.length > 0 ? " · 每 12 秒自动检测在线状态" : null}
      </p>
    </div>
  );
}
