import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "studio_theme";

function applyThemeClass(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("studio-theme-dark", "theme-dark");
  } else {
    root.classList.remove("studio-theme-dark", "theme-dark");
  }
}

function readLegacyTheme(): ThemeMode {
  try {
    const stored =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("canvas_theme") ||
      "light";
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: readLegacyTheme(),
      setMode: (mode) => {
        applyThemeClass(mode);
        set({ mode });
      },
      toggle: () => {
        const next = get().mode === "dark" ? "light" : "dark";
        get().setMode(next);
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.mode);
      },
    },
  ),
);

applyThemeClass(readLegacyTheme());
