import { createRoot } from "react-dom/client";
import { App } from "./App";

const bootTheme = () => {
  try {
    const theme =
      localStorage.getItem("studio_theme") ||
      localStorage.getItem("canvas_theme") ||
      "light";
    if (theme === "dark") {
      document.documentElement.classList.add("studio-theme-dark", "theme-dark");
    }
  } catch {
    /* ignore */
  }
};

bootTheme();
createRoot(document.getElementById("root")!).render(<App />);
