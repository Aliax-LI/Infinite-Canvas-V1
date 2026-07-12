import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { downloadWorkflowJson } from "./toolClient";

interface WorkflowExportButtonProps {
  workflow: string;
  testId?: string;
  compact?: boolean;
}

export function WorkflowExportButton({
  workflow,
  testId = "workflow-export",
  compact = false,
}: WorkflowExportButtonProps) {
  const { t } = useTranslation("studio");

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <button
        type="button"
        className="studio-tool-link-btn inline-flex items-center gap-1.5"
        onClick={() => void downloadWorkflowJson(workflow)}
        data-testid={testId}
      >
        <Download className="w-3.5 h-3.5" />
        {t("studio.workflowExport")}
      </button>
      {!compact ? (
        <p className="text-[10px] text-[var(--muted)]">{t("studio.workflowExportHint")}</p>
      ) : null}
    </div>
  );
}
