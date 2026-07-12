import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useStatusToast } from "./useStatusToast";

const GENERATED_CATEGORY_ID = "generated";

type AssetLibraryCategory = {
  id: string;
  name?: string;
  type?: string;
  items?: unknown[];
};

type AssetLibraryResponse = {
  library?: {
    active_library_id?: string;
    libraries?: Array<{ id: string; categories?: AssetLibraryCategory[] }>;
    categories?: AssetLibraryCategory[];
  };
};

function resolveImportTarget(data: AssetLibraryResponse | undefined) {
  const lib = data?.library;
  if (!lib) return { libraryId: "", categoryId: "" };
  const activeId = lib.active_library_id ?? lib.libraries?.[0]?.id ?? "";
  const active =
    lib.libraries?.find((item) => item.id === activeId) ?? lib.libraries?.[0] ?? null;
  const categories = active?.categories ?? lib.categories ?? [];
  const imageCategories = categories.filter((c) => c.type === "image" || !c.type);
  const generated =
    imageCategories.find((c) => c.id === GENERATED_CATEGORY_ID) ?? imageCategories[0];
  return {
    libraryId: active?.id ?? activeId,
    categoryId: generated?.id ?? "",
  };
}

export function useAssetLibrarySync() {
  const { t } = useTranslation("studio");
  const queryClient = useQueryClient();
  const { statusText, setStatusText } = useStatusToast();

  const { data: libraryData } = useQuery({
    queryKey: ["asset-library"],
    queryFn: () => api.get<AssetLibraryResponse>("/api/asset-library"),
    staleTime: 60_000,
  });

  const importTarget = useMemo(() => resolveImportTarget(libraryData), [libraryData]);

  const addMutation = useMutation({
    mutationFn: async (payload: { urls: string[]; name?: string }) => {
      const { libraryId, categoryId } = importTarget;
      if (!categoryId) {
        throw new Error("no category");
      }
      const items = payload.urls
        .filter(Boolean)
        .map((url, index) => ({
          url,
          name:
            payload.name && payload.urls.length === 1
              ? payload.name
              : payload.name
                ? `${payload.name}_${index + 1}`
                : "",
        }));
      if (!items.length) {
        throw new Error("no urls");
      }
      return api.post<{ items?: unknown[] }>("/api/asset-library/items/batch", {
        category_id: categoryId,
        library_id: libraryId,
        items,
      });
    },
    onSuccess: (result) => {
      const count = result.items?.length ?? 0;
      setStatusText(t("studio.addToLibrarySuccess", { count }));
      void queryClient.invalidateQueries({ queryKey: ["asset-library"] });
    },
    onError: () => {
      setStatusText(t("studio.addToLibraryFailed"));
    },
  });

  return {
    addToLibrary: addMutation.mutate,
    isAdding: addMutation.isPending,
    statusText,
    canAddToLibrary: Boolean(importTarget.categoryId),
  };
}
