import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const localesDir = path.resolve(__dirname, "../../src/shared/i18n/locales");

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, full));
    } else {
      out[full] = String(value ?? "");
    }
  }
  return out;
}

function loadNs(lang: string, ns: string) {
  const file = path.join(localesDir, lang, `${ns}.json`);
  return flatten(JSON.parse(fs.readFileSync(file, "utf8")));
}

const NAMESPACES = [
  "common",
  "studio",
  "smart-canvas",
  "canvas",
  "api-settings",
  "comfyui-settings",
  "chat",
  "tools",
  "assets",
];

describe("i18n namespaces", () => {
  for (const ns of NAMESPACES) {
    it(`${ns} zh/en have same keys`, () => {
      const zh = loadNs("zh", ns);
      const en = loadNs("en", ns);
      const keys = new Set([...Object.keys(zh), ...Object.keys(en)]);
      for (const k of keys) {
        expect(k in zh, `missing zh ${ns}.${k}`).toBe(true);
        expect(k in en, `missing en ${ns}.${k}`).toBe(true);
      }
    });

    it(`${ns} has content`, () => {
      const zh = loadNs("zh", ns);
      expect(Object.keys(zh).length).toBeGreaterThan(0);
    });
  }
});

describe("i18n key samples", () => {
  const samples = [
    ["common", "nav.canvas"],
    ["common", "nav.settings"],
    ["api-settings", "title"],
    ["smart-canvas", "createImportNode"],
    ["canvas", "generate"],
    ["chat", "title"],
    ["tools", "title"],
    ["assets", "title"],
  ] as const;

  for (const [ns, key] of samples) {
    it(`${ns}.${key} exists in zh`, () => {
      const zh = loadNs("zh", ns);
      expect(zh[key] ?? "").not.toBe("");
    });
  }
});
