/**
 * Apply Electron / electron-builder China mirrors via env vars (not .npmrc).
 * npm no longer accepts electron_mirror keys in .npmrc; use ELECTRON_MIRROR instead.
 *
 * Override: set ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR before running.
 */
const { spawnSync } = require('child_process');

const DEFAULT_MIRRORS = {
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

const env = { ...process.env };
for (const [key, value] of Object.entries(DEFAULT_MIRRORS)) {
  if (!env[key]) {
    env[key] = value;
  }
}

const [, , ...args] = process.argv;
if (args.length === 0) {
  console.error('Usage: node scripts/electron-mirror-env.js <command> [args...]');
  process.exit(1);
}

const [cmd, ...cmdArgs] = args;
const result = spawnSync(cmd, cmdArgs, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
