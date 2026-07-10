#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(scriptDir, "../frontend/src/shared/i18n/locales");
const legacyI18nDir = path.resolve(scriptDir, "../history/static/js/i18n");

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

function loadLang(lang: string): Record<string, string> {
  const dir = path.join(localesDir, lang);
  const merged: Record<string, string> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const ns = file.replace(/\.json$/, "");
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const flat = flatten(raw);
    for (const [k, v] of Object.entries(flat)) {
      merged[`${ns}.${k}`] = v;
    }
  }
  return merged;
}

function loadLegacyKeys(): Map<string, { zh: string; en: string }> {
  const keys = new Map<string, { zh: string; en: string }>();
  if (!fs.existsSync(legacyI18nDir)) return keys;
  const re =
    /"([^"]+)":\s*\{\s*zh:\s*"((?:\\.|[^"\\])*)",\s*en:\s*"((?:\\.|[^"\\])*)"\s*\}/g;
  for (const file of fs.readdirSync(legacyI18nDir).filter((f) => f.endsWith(".js"))) {
    const content = fs.readFileSync(path.join(legacyI18nDir, file), "utf8");
    let match: RegExpExecArray | null;
    while ((match = re.exec(content))) {
      const [, key, zh, en] = match;
      keys.set(key, {
        zh: zh.replace(/\\"/g, '"'),
        en: en.replace(/\\"/g, '"'),
      });
    }
  }
  return keys;
}

function resolveLegacyKey(
  legacyKey: string,
  reactKeys: Set<string>,
): string | null {
  const candidates = [
    `studio.${legacyKey}`,
    `common.${legacyKey}`,
    `canvas.${legacyKey}`,
    `smart-canvas.${legacyKey}`,
    legacyKey,
  ];
  for (const c of candidates) {
    if (reactKeys.has(c)) return c;
  }
  const dot = legacyKey.indexOf(".");
  if (dot > 0) {
    const ns = legacyKey.slice(0, dot);
    const rest = legacyKey.slice(dot + 1);
    const alt = `${ns}.${rest}`;
    if (reactKeys.has(alt)) return alt;
  }
  return null;
}

const zh = loadLang("zh");
const en = loadLang("en");
const allKeys = new Set([...Object.keys(zh), ...Object.keys(en)]);

const missingZh: string[] = [];
const missingEn: string[] = [];

for (const key of [...allKeys].sort()) {
  if (!(key in zh)) missingZh.push(key);
  if (!(key in en)) missingEn.push(key);
}

let exitCode = 0;

if (missingZh.length || missingEn.length) {
  if (missingZh.length) {
    console.error("Missing zh keys:", missingZh.join(", "));
  }
  if (missingEn.length) {
    console.error("Missing en keys:", missingEn.join(", "));
  }
  exitCode = 1;
}

const legacyKeys = loadLegacyKeys();
const reactKeySet = allKeys;
const uncoveredLegacy: string[] = [];

const migratedPrefixes = ["chat.", "tools."];
const migratedExact = new Set([
  "nav.canvases",
  "nav.online",
  "nav.chat",
  "nav.tools",
  "nav.assets",
  "nav.settings",
  "online.title",
  "online.promptPlaceholder",
  "online.size",
  "online.quality",
  "online.qualityAuto",
  "online.qualityLow",
  "online.qualityMedium",
  "online.qualityHigh",
  "online.square",
  "online.portrait",
  "online.landscape",
  "studio.dropImage",
  "studio.processing",
  "studio.inputPrompt",
  "studio.referenceLayers",
  "studio.refinementStrength",
  "studio.superResolution",
  "studio.detailLora",
  "studio.loraStrength",
  "studio.cameraControl",
  "studio.rotation",
  "studio.pitch",
  "studio.distance",
  "studio.reset",
  "studio.generatedCommand",
  "studio.archives",
  "studio.loadingArchives",
  "common.back",
  "common.submit",
  "common.close",
  "common.confirm",
  "settings.title",
]);

for (const [legacyKey] of legacyKeys) {
  const inScope =
    migratedPrefixes.some((p) => legacyKey.startsWith(p)) ||
    migratedExact.has(legacyKey);
  if (!inScope) continue;
  if (!resolveLegacyKey(legacyKey, reactKeySet)) {
    uncoveredLegacy.push(legacyKey);
  }
}

const migratedTotal = [...legacyKeys.keys()].filter(
  (k) =>
    migratedPrefixes.some((p) => k.startsWith(p)) || migratedExact.has(k),
).length;
const migratedCovered = migratedTotal - uncoveredLegacy.length;

if (uncoveredLegacy.length) {
  console.error(
    "Migrated legacy keys not covered in React locales:",
    uncoveredLegacy.sort().join(", "),
  );
  exitCode = 1;
}

if (exitCode) {
  process.exit(exitCode);
}

console.log(
  `i18n ok: ${allKeys.size} keys (zh/en parity), legacy coverage ${migratedCovered}/${migratedTotal} migrated keys`,
);
