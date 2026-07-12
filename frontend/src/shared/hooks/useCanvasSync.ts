import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  appendUrlsToClassicCanvas,
  resolveTargetClassicCanvasId,
} from "../../features/canvas/core/addResultToCanvas";
import { useStatusToast } from "./useStatusToast";

export function useCanvasSync() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const { statusText, setStatusText } = useStatusToast();

  const addMutation = useMutation({
    mutationFn: async (payload: { urls: string[]; title?: string }) => {
      const urls = payload.urls.filter(Boolean);
      if (!urls.length) {
        throw new Error("no urls");
      }
      const canvasId = await resolveTargetClassicCanvasId();
      return appendUrlsToClassicCanvas(canvasId, urls, { title: payload.title });
    },
    onSuccess: (result) => {
      setStatusText(
        t("studio.addToCanvasSuccess", { count: result.addedCount }),
      );
      void queryClient.invalidateQueries({ queryKey: ["canvases"] });
    },
    onError: () => {
      setStatusText(t("studio.addToCanvasFailed"));
    },
  });

  return {
    addToCanvas: addMutation.mutate,
    isAddingToCanvas: addMutation.isPending,
    statusText,
    canAddToCanvas: true,
  };
}
