const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'out',
  'util',
  'resEdit.js'
);

if (!fs.existsSync(target)) {
  console.log('[resedit patch] app-builder-lib is not installed; skipping.');
  process.exit(0);
}

const marker = 'async function withTransientFileRetry';
const original = fs.readFileSync(target, 'utf8');
if (original.includes(marker)) {
  console.log('[resedit patch] retry patch already applied.');
  process.exit(0);
}

const importNeedle = 'const resedit_1 = require("resedit");\n';
const readNeedle = '    const buffer = await (0, promises_1.readFile)(opts.file);';
const writeNeedle = '    await (0, promises_1.writeFile)(opts.file, Buffer.from(executable.generate()));';

if (![importNeedle, readNeedle, writeNeedle].every(needle => original.includes(needle))) {
  throw new Error(
    '[resedit patch] Unsupported app-builder-lib layout. Review out/util/resEdit.js before packaging.'
  );
}

const helper = `${importNeedle}async function withTransientFileRetry(action) {
    const retryableCodes = new Set(["EBUSY", "EPERM", "EACCES", "UNKNOWN"]);
    let lastError;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            return await action();
        }
        catch (error) {
            lastError = error;
            const message = String(error?.message || error);
            if (!retryableCodes.has(error?.code) && !/unknown error, open/i.test(message))
                throw error;
            if (attempt === 7)
                break;
            await new Promise(resolve => setTimeout(resolve, 150 * 2 ** attempt));
        }
    }
    throw lastError;
}
`;

const patched = original
  .replace(importNeedle, helper)
  .replace(readNeedle, '    const buffer = await withTransientFileRetry(() => (0, promises_1.readFile)(opts.file));')
  .replace(
    writeNeedle,
    '    await withTransientFileRetry(() => (0, promises_1.writeFile)(opts.file, Buffer.from(executable.generate())));'
  );

fs.writeFileSync(target, patched, 'utf8');
console.log('[resedit patch] transient Windows file retry applied.');

