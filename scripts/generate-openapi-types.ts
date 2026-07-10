/**
 * Fetch /openapi.json and write frontend/src/types/api.d.ts
 * Usage: npx tsx scripts/generate-openapi-types.ts [baseUrl]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const out = resolve("frontend/src/types/api.d.ts");

async function main() {
  const res = await fetch(`${base}/openapi.json`);
  if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`);
  const schema = await res.json();

  const header = `/** Auto-generated from ${base}/openapi.json — ${new Date().toISOString()} */\n`;
  const body = `export type OpenAPISchema = ${JSON.stringify(schema, null, 2)};\n`;
  writeFileSync(out, header + body, "utf8");
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
