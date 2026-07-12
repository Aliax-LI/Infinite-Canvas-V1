import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkflowAvailability } from "./toolClient";

interface WorkflowAvailabilityHintProps {
  availability: WorkflowAvailability | null;
  loading?: boolean;
  testId?: string;
}

export function formatWorkflowAvailabilityHint(
  availability: WorkflowAvailability | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!availability || availability.available) return "";
  if (availability.reason?.includes("ComfyUI 未在线") || availability.reason === "ComfyUI offline") {
    return t("studio.localComfyOffline");
  }
  const parts: string[] = [t("studio.workflowUnavailableHint")];
  if (availability.missing_nodes?.length) {
    parts.push(
      t("studio.workflowMissingNodes", { nodes: availability.missing_nodes.join(", ") }),
    );
  }
  if (availability.missing_models?.length) {
    parts.push(
      t("studio.workflowMissingModels", { models: availability.missing_models.join(", ") }),
    );
  }
  return parts.join(" ");
}

export function WorkflowAvailabilityHint({
  availability,
  loading = false,
  testId = "workflow-availability-hint",
}: WorkflowAvailabilityHintProps) {
  const { t } = useTranslation("studio");
  if (loading || !availability || availability.available) return null;
  const text = formatWorkflowAvailabilityHint(availability, t);
  if (!text) return null;
  return (
    <p className="text-xs text-amber-700" data-testid={testId}>
      {text}
    </p>
  );
}
