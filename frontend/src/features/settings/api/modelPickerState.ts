export type ModelCategory = "image" | "chat" | "video";
export type ModelPickerTab = "all" | ModelCategory;

export interface FetchedModels {
  all?: string[];
  image_models?: string[];
  chat_models?: string[];
  video_models?: string[];
  total?: number;
  message?: string;
}

export interface ModelPickerState {
  category: Record<string, ModelCategory>;
  selected: Record<string, boolean>;
}

export interface ProviderModels {
  image_models?: string[];
  chat_models?: string[];
  video_models?: string[];
}

export function normalizeFetchedModels(res: FetchedModels): FetchedModels {
  const image_models = res.image_models ?? [];
  const chat_models = res.chat_models ?? [];
  const video_models = res.video_models ?? [];
  const all = res.all?.length
    ? res.all
    : [...new Set([...image_models, ...chat_models, ...video_models])];

  return {
    ...res,
    image_models,
    chat_models,
    video_models,
    all,
    total: res.total ?? all.length,
  };
}

export function hasFetchedModels(fetched: FetchedModels | null | undefined): boolean {
  return Boolean(fetched?.all?.length);
}

export function modelKindToPickerTab(
  kind: "image_models" | "chat_models" | "video_models",
): ModelCategory {
  if (kind === "image_models") return "image";
  if (kind === "video_models") return "video";
  return "chat";
}

export function buildModelPickerState(
  fetched: FetchedModels,
  existing: ProviderModels,
): ModelPickerState {
  const suggestion = {
    image: new Set(fetched.image_models ?? []),
    chat: new Set(fetched.chat_models ?? []),
    video: new Set(fetched.video_models ?? []),
  };
  const existingSets = {
    image: new Set(existing.image_models ?? []),
    chat: new Set(existing.chat_models ?? []),
    video: new Set(existing.video_models ?? []),
  };
  const allIds = new Set([
    ...(fetched.all ?? []),
    ...(existing.image_models ?? []),
    ...(existing.chat_models ?? []),
    ...(existing.video_models ?? []),
  ]);

  const category: Record<string, ModelCategory> = {};
  const selected: Record<string, boolean> = {};

  allIds.forEach((id) => {
    let cat: ModelCategory;
    if (existingSets.image.has(id)) cat = "image";
    else if (existingSets.video.has(id)) cat = "video";
    else if (existingSets.chat.has(id)) cat = "chat";
    else if (suggestion.image.has(id)) cat = "image";
    else if (suggestion.video.has(id)) cat = "video";
    else cat = "chat";

    category[id] = cat;
    selected[id] =
      existingSets.image.has(id) || existingSets.chat.has(id) || existingSets.video.has(id);
  });

  return { category, selected };
}

export function applyModelPickerState(state: ModelPickerState): ProviderModels {
  const image: string[] = [];
  const chat: string[] = [];
  const video: string[] = [];

  Object.entries(state.selected).forEach(([id, sel]) => {
    if (!sel) return;
    const cat = state.category[id];
    if (cat === "image") image.push(id);
    else if (cat === "video") video.push(id);
    else chat.push(id);
  });

  return { image_models: image, chat_models: chat, video_models: video };
}

export function countPickerStats(state: ModelPickerState) {
  const ids = Object.keys(state.category);
  const totals = { all: ids.length, image: 0, chat: 0, video: 0 };
  const selecteds = { all: 0, image: 0, chat: 0, video: 0 };

  ids.forEach((id) => {
    const cat = state.category[id];
    totals[cat]++;
    if (state.selected[id]) {
      selecteds[cat]++;
      selecteds.all++;
    }
  });

  return { totals, selecteds };
}
