import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { cn } from "../utils";

/**
 * Reusable studio modal dialog.
 *
 * @example
 * ```tsx
 * <StudioDialog
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="保存成功"
 *   variant="success"
 *   primaryAction={{ label: "确定", onClick: () => setOpen(false) }}
 * >
 *   配置已写入本地。
 * </StudioDialog>
 * ```
 */
export type StudioDialogVariant = "info" | "success" | "warning" | "error";

export interface StudioDialogAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  testId?: string;
}

export interface StudioDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  variant?: StudioDialogVariant;
  primaryAction?: StudioDialogAction;
  secondaryAction?: StudioDialogAction;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  "data-testid"?: string;
}

const VARIANT_ICON: Record<StudioDialogVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function StudioDialog({
  open,
  onClose,
  title,
  children,
  variant = "info",
  primaryAction,
  secondaryAction,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  "data-testid": testId = "studio-dialog",
}: StudioDialogProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEscapeKey(open && closeOnEscape, handleClose);

  if (!open) return null;

  const Icon = VARIANT_ICON[variant];
  const titleId = `${testId}-title`;

  return (
    <div
      className="studio-dialog-overlay"
      data-testid={testId}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={cn("studio-dialog", `studio-dialog--${variant}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="studio-dialog-head">
          <div className="studio-dialog-title-row">
            <Icon className="studio-dialog-icon" aria-hidden="true" />
            <h2 id={titleId} className="studio-dialog-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="studio-icon-btn"
            onClick={handleClose}
            aria-label="关闭"
            data-testid={`${testId}-close`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children ? <div className="studio-dialog-body">{children}</div> : null}

        {(primaryAction || secondaryAction) && (
          <div className="studio-dialog-footer">
            {secondaryAction ? (
              <button
                type="button"
                className="studio-action-btn"
                onClick={secondaryAction.onClick}
                data-testid={secondaryAction.testId ?? `${testId}-secondary`}
              >
                {secondaryAction.label}
              </button>
            ) : null}
            {primaryAction ? (
              <button
                type="button"
                className={cn(
                  "studio-action-btn",
                  primaryAction.variant === "secondary" ? undefined : "primary",
                )}
                onClick={primaryAction.onClick}
                data-testid={primaryAction.testId ?? `${testId}-primary`}
              >
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
