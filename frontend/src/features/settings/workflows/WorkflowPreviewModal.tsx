import { Eye, Play, X } from "lucide-react";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { WorkflowFieldControls } from "./WorkflowFieldControls";
import type { PreviewValues, WorkflowField } from "./workflowFieldUtils";

interface WorkflowPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: WorkflowField[];
  values: PreviewValues;
  onChange: (fieldId: string, value: unknown) => void;
  onRun?: () => void;
  running?: boolean;
  runResultUrl?: string;
  runMessage?: string;
}

export function WorkflowPreviewModal({
  open,
  onClose,
  title,
  fields,
  values,
  onChange,
  onRun,
  running,
  runResultUrl,
  runMessage,
}: WorkflowPreviewModalProps) {
  useEscapeKey(open, onClose);

  if (!open) return null;

  return (
    <div
      className="studio-dialog-overlay"
      data-testid="workflow-preview-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="studio-dialog studio-workflow-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-preview-modal-title"
      >
        <div className="studio-dialog-head">
          <div className="studio-dialog-title-row">
            <Eye className="studio-dialog-icon" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="workflow-preview-modal-title" className="studio-dialog-title">
                画布节点预览
              </h2>
              <div className="studio-workflow-preview-sub">{title}</div>
            </div>
          </div>
          <button
            type="button"
            className="studio-icon-btn"
            onClick={onClose}
            aria-label="关闭"
            data-testid="workflow-preview-modal-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="studio-dialog-body studio-workflow-preview-body">
          <p className="studio-field-hint">
            工作流 Comfy 节点在智能画布上的控件预览，可在此快速填参并运行测试。
          </p>
          {fields.length === 0 ? (
            <div className="studio-model-empty">勾选节点输入字段后，预览将出现在这里</div>
          ) : (
            <div className="studio-workflow-preview-fields" data-testid="workflow-sidebar-preview">
              {fields.map((f) => (
                <div key={f.id} className="studio-mini-field" data-testid={`workflow-preview-field-${f.id}`}>
                  <div className="studio-mini-field-label">{f.name || f.input}</div>
                  <WorkflowFieldControls
                    field={f}
                    value={values[f.id]}
                    onChange={(v) => onChange(f.id, v)}
                  />
                  <div className="studio-mini-field-meta">
                    node {f.node} · {f.type}
                  </div>
                </div>
              ))}
            </div>
          )}
          {runMessage ? (
            <div className="studio-mini-run-message" data-testid="workflow-run-message">
              {runMessage}
            </div>
          ) : null}
          {runResultUrl ? (
            <div className="studio-mini-run-result" data-testid="workflow-run-result">
              <img src={runResultUrl} alt="运行结果" />
            </div>
          ) : null}
        </div>

        {onRun ? (
          <div className="studio-dialog-footer">
            <button type="button" className="studio-action-btn" onClick={onClose}>
              关闭
            </button>
            <button
              type="button"
              className="studio-action-btn primary"
              onClick={onRun}
              disabled={running || fields.length === 0}
              data-testid="workflow-preview-run-btn"
            >
              <Play className="w-4 h-4" />
              {running ? "运行中..." : "运行测试"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
