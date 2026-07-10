import { api } from "../../../shared/api/client";

export interface LoraCatalogItem {
  id: string;
  name: string;
}

export interface LoraCatalogResponse {
  items: LoraCatalogItem[];
  total: number;
  page_number: number;
  page_size: number;
  sub_vision_foundation: string;
  target_model?: string;
}

export function fetchMsLoraCatalog(
  targetModel: string,
  options?: { pageNumber?: number; pageSize?: number; name?: string },
): Promise<LoraCatalogResponse> {
  const params = new URLSearchParams();
  params.set("target_model", targetModel);
  if (options?.pageNumber) params.set("page_number", String(options.pageNumber));
  if (options?.pageSize) params.set("page_size", String(options.pageSize));
  if (options?.name) params.set("name", options.name);
  return api.get<LoraCatalogResponse>(`/api/providers/modelscope/fetch-loras?${params.toString()}`);
}
