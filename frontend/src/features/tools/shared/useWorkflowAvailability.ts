import { useEffect, useState } from "react";
import { fetchWorkflowAvailability, type WorkflowAvailability } from "./toolClient";

export function useWorkflowAvailability(workflow: string | null | undefined, enabled = true) {
  const [state, setState] = useState<WorkflowAvailability | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && workflow));

  useEffect(() => {
    if (!enabled || !workflow) {
      setState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchWorkflowAvailability(workflow)
      .then((data) => {
        if (cancelled) return;
        setState(data);
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          workflow,
          available: false,
          missing_nodes: [],
          missing_models: [],
          reason: "ComfyUI offline",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, workflow]);

  return {
    availability: state,
    loading,
    localReady: !enabled || state?.available === true,
  };
}
