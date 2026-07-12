import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";
import {
  annotationCapableProviders,
  filterAnnotationChatModels,
  type AnnotationProvider,
} from "./annotationModelFilter";

export interface AnnotationSettings {
  provider: string;
  model: string;
  ms_model: string;
  prompt: string;
}

function normalizeProviders(raw: AnnotationProvider[] = []): AnnotationProvider[] {
  return annotationCapableProviders(raw);
}

export function useAssetAnnotationSettings() {
  const queryClient = useQueryClient();

  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ["api-providers"],
    queryFn: () => api.get<{ providers?: AnnotationProvider[] }>("/api/providers"),
  });

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["asset-annotation-settings"],
    queryFn: () => api.get<{ settings?: AnnotationSettings }>("/api/asset-library/annotation-settings"),
  });

  const providers = useMemo(
    () => normalizeProviders(providersData?.providers ?? []),
    [providersData],
  );

  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    const saved = settingsData?.settings;
    if (!saved) return;
    setProvider(saved.provider || providers[0]?.id || "");
    setModel(saved.model || "");
    setPrompt(saved.prompt || "");
  }, [settingsData, providers]);

  const activeProvider = providers.find((p) => p.id === provider) ?? providers[0];
  const modelOptions = useMemo(
    () => filterAnnotationChatModels(activeProvider?.chat_models ?? []),
    [activeProvider],
  );

  useEffect(() => {
    if (!provider && providers[0]?.id) {
      setProvider(providers[0].id);
    }
  }, [provider, providers]);

  useEffect(() => {
    if (!modelOptions.length) {
      if (model) setModel("");
      return;
    }
    if (!model || !modelOptions.includes(model)) {
      setModel(modelOptions[0]);
    }
  }, [model, modelOptions]);

  const saveMutation = useMutation({
    mutationFn: (payload: { provider: string; model: string; prompt: string }) =>
      api.patch("/api/asset-library/annotation-settings", {
        provider: payload.provider,
        model: payload.model,
        ms_model: payload.provider === "modelscope" ? payload.model : "",
        prompt: payload.prompt,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["asset-annotation-settings"] });
    },
  });

  const save = useCallback(
    (next?: Partial<{ provider: string; model: string; prompt: string }>) => {
      const payload = {
        provider: next?.provider ?? provider,
        model: next?.model ?? model,
        prompt: next?.prompt ?? prompt,
      };
      if (!payload.provider) return;
      saveMutation.mutate(payload);
    },
    [provider, model, prompt, saveMutation],
  );

  const updateProvider = useCallback(
    (nextProvider: string) => {
      setProvider(nextProvider);
      const nextProviderObj = providers.find((p) => p.id === nextProvider);
      const nextModels = filterAnnotationChatModels(nextProviderObj?.chat_models ?? []);
      const nextModel = nextModels[0] ?? "";
      setModel(nextModel);
      save({ provider: nextProvider, model: nextModel });
    },
    [providers, save],
  );

  const updateModel = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      save({ model: nextModel });
    },
    [save],
  );

  const updatePrompt = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt);
  }, []);

  const savePrompt = useCallback(() => {
    save({ prompt });
  }, [prompt, save]);

  return {
    providers,
    provider,
    model,
    prompt,
    modelOptions,
    isLoading: providersLoading || settingsLoading,
    isSaving: saveMutation.isPending,
    updateProvider,
    updateModel,
    updatePrompt,
    savePrompt,
    save,
  };
}
