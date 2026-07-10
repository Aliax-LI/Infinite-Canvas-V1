import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import type { RunningHubWorkflow } from "../../../types/api";

interface WorkflowPickerProps {
  onSelect: (workflow: RunningHubWorkflow) => void;
}

export function WorkflowPicker({ onSelect }: WorkflowPickerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["runninghub-workflows"],
    queryFn: () =>
      api.get<{ workflows: RunningHubWorkflow[] }>("/api/runninghub/workflows"),
  });

  if (isLoading) {
    return <p className="text-sm text-[var(--muted)]">加载工作流...</p>;
  }

  const workflows = data?.workflows ?? [];

  return (
    <div className="space-y-2" data-testid="workflow-picker">
      {workflows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">暂无 RunningHub 工作流</p>
      ) : (
        workflows.map((wf) => (
          <button
            key={wf.id}
            type="button"
            onClick={() => onSelect(wf)}
            className="w-full text-left border border-[var(--border)] p-3 hover:bg-[var(--nav-hover-bg)]"
          >
            <div className="font-medium text-sm">{wf.name}</div>
            {wf.description && (
              <div className="text-xs text-[var(--muted)]">{wf.description}</div>
            )}
          </button>
        ))
      )}
    </div>
  );
}
