import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh/common.json";
import en from "./locales/en/common.json";
import zhStudio from "./locales/zh/studio.json";
import enStudio from "./locales/en/studio.json";
import zhSmartCanvas from "./locales/zh/smart-canvas.json";
import enSmartCanvas from "./locales/en/smart-canvas.json";
import zhCanvas from "./locales/zh/canvas.json";
import enCanvas from "./locales/en/canvas.json";
import zhApiSettings from "./locales/zh/api-settings.json";
import enApiSettings from "./locales/en/api-settings.json";
import zhComfyui from "./locales/zh/comfyui-settings.json";
import enComfyui from "./locales/en/comfyui-settings.json";
import zhChat from "./locales/zh/chat.json";
import enChat from "./locales/en/chat.json";
import zhTools from "./locales/zh/tools.json";
import enTools from "./locales/en/tools.json";
import zhAssets from "./locales/zh/assets.json";
import enAssets from "./locales/en/assets.json";

const savedLang = (() => {
  try {
    return localStorage.getItem("studio_lang") || "zh";
  } catch {
    return "zh";
  }
})();

i18n.use(initReactI18next).init({
  resources: {
    zh: {
      common: zh,
      studio: zhStudio,
      "smart-canvas": zhSmartCanvas,
      canvas: zhCanvas,
      "api-settings": zhApiSettings,
      "comfyui-settings": zhComfyui,
      chat: zhChat,
      tools: zhTools,
      assets: zhAssets,
    },
    en: {
      common: en,
      studio: enStudio,
      "smart-canvas": enSmartCanvas,
      canvas: enCanvas,
      "api-settings": enApiSettings,
      "comfyui-settings": enComfyui,
      chat: enChat,
      tools: enTools,
      assets: enAssets,
    },
  },
  lng: savedLang,
  fallbackLng: "zh",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem("studio_lang", lng);
  } catch {
    /* ignore */
  }
});

export default i18n;
