#!/usr/bin/env npx tsx
/**
 * Extract legacy StudioI18n keys from history/static/js/i18n/*.js into JSON namespaces.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const legacyRoot = path.join(root, "history/static");

const files = [
  "js/i18n-core.js",
  "js/i18n/common.js",
  "js/i18n/studio.js",
  "js/i18n/api-settings.js",
  "js/i18n/canvas.js",
  "js/i18n/smart-canvas.js",
  "js/i18n/comfyui-settings.js",
  "js/i18n.js",
];

const sandbox: Record<string, unknown> = {
  window: {},
  document: {
    readyState: "complete",
    currentScript: null,
    addEventListener() {},
    createElement() {
      return {};
    },
    head: { appendChild() {} },
    write() {},
    querySelectorAll() {
      return [];
    },
    documentElement: { setAttribute() {} },
  },
  localStorage: { getItem() { return null; }, setItem() {} },
  CustomEvent: function CustomEvent(type: string, init?: Record<string, unknown>) {
    return { type, ...init };
  },
  console,
};
(sandbox.window as Record<string, unknown>).dispatchEvent = function dispatchEvent() {};

for (const file of files) {
  const abs = path.join(legacyRoot, file);
  if (!fs.existsSync(abs)) continue;
  new vm.Script(fs.readFileSync(abs, "utf8"), { filename: file }).runInNewContext(sandbox);
}

const entries = (
  (sandbox.window as { StudioI18n?: { entries?: () => { zh: Record<string, string>; en: Record<string, string> } } })
    .StudioI18n?.entries?.() ?? { zh: {}, en: {} }
);

const NS_MAP: Record<string, string> = {
  "api.": "api-settings",
  "comfy.": "comfyui-settings",
  "canvas.": "canvas",
  "smart.": "smart-canvas",
  "studio.": "studio",
  "common.": "common",
  "chat.": "chat",
  "tools.": "tools",
  "assets.": "assets",
};

function nsForKey(key: string): string {
  for (const [prefix, ns] of Object.entries(NS_MAP)) {
    if (key.startsWith(prefix)) return ns;
  }
  return "common";
}

function unflatten(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let cur: Record<string, unknown> = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
  }
  return out;
}

const byNs: Record<string, { zh: Record<string, string>; en: Record<string, string> }> = {};

for (const key of new Set([...Object.keys(entries.zh ?? {}), ...Object.keys(entries.en ?? {})])) {
  const ns = nsForKey(key);
  if (!byNs[ns]) byNs[ns] = { zh: {}, en: {} };
  const stripPrefix = key.replace(/^(api|comfy|canvas|smart|studio|common|chat|tools|assets)\./, "");
  if (entries.zh?.[key]) byNs[ns].zh[stripPrefix] = entries.zh[key];
  if (entries.en?.[key]) byNs[ns].en[stripPrefix] = entries.en[key];
}

const localesDir = path.join(root, "frontend/src/shared/i18n/locales");
for (const [ns, langs] of Object.entries(byNs)) {
  for (const lang of ["zh", "en"] as const) {
    const dir = path.join(localesDir, lang);
    fs.mkdirSync(dir, { recursive: true });
    const flat = langs[lang];
    const nested = unflatten(flat);
    const outPath = path.join(dir, `${ns}.json`);
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(outPath)) {
      existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
    }
    const merged = deepMerge(existing, nested);
    fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  }
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") {
      out[k] = deepMerge(a[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

console.log(`Migrated ${Object.keys(entries.zh ?? {}).length} legacy i18n keys into ${Object.keys(byNs).length} namespaces`);
