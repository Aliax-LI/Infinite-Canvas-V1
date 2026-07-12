const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const STORAGE_SCHEMA_VERSION = 1;
const MIN_RECOMMENDED_FREE_BYTES = 10 * 1024 * 1024 * 1024;

function storageStatePath(userData) {
  return path.join(userData, 'storage-state.json');
}

function defaultStorageRoot(userData) {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Infinite Canvas', 'storage');
  }
  return path.join(userData, 'storage');
}

async function readStorageState(userData) {
  try {
    const state = JSON.parse(await fsp.readFile(storageStatePath(userData), 'utf8'));
    if (!state || typeof state.root !== 'string' || !state.root.trim()) return null;
    return state;
  } catch (_) {
    return null;
  }
}

async function needsStorageSetup(userData) {
  const state = await readStorageState(userData);
  return !(state?.completed && state.schemaVersion === STORAGE_SCHEMA_VERSION);
}

function storageLayout(root) {
  const resolved = path.resolve(root);
  return {
    root: resolved,
    data: path.join(resolved, 'data'),
    assets: path.join(resolved, 'objects'),
    output: path.join(resolved, 'exports'),
    workflows: path.join(resolved, 'workflows'),
    config: path.join(resolved, 'config'),
    apiEnv: path.join(resolved, 'config', 'api.env'),
    minio: path.join(resolved, 'minio')
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

async function availableBytes(target) {
  if (typeof fsp.statfs !== 'function') return null;
  let probe = path.resolve(target);
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return null;
    probe = parent;
  }
  try {
    const stats = await fsp.statfs(probe);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (_) {
    return null;
  }
}

async function validateStorageRoot(root, forbiddenRoot = '') {
  if (typeof root !== 'string' || !root.trim()) {
    return { ok: false, error: '请选择本地数据目录。' };
  }
  const resolved = path.resolve(root.trim());
  if (forbiddenRoot) {
    const forbidden = path.resolve(forbiddenRoot);
    const relative = path.relative(forbidden, resolved);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return { ok: false, error: '数据目录不能放在应用安装目录中，请选择其他位置。' };
    }
  }

  const marker = path.join(resolved, `.write-test-${process.pid}-${crypto.randomUUID()}`);
  try {
    await fsp.mkdir(resolved, { recursive: true });
    await fsp.writeFile(marker, 'ok', 'utf8');
    await fsp.unlink(marker);
  } catch (error) {
    try { await fsp.unlink(marker); } catch (_) {}
    return { ok: false, error: `目录不可写：${error?.message || error}` };
  }

  const freeBytes = await availableBytes(resolved);
  return {
    ok: true,
    root: resolved,
    freeBytes,
    freeText: freeBytes == null ? '未知' : formatBytes(freeBytes),
    recommended: freeBytes == null || freeBytes >= MIN_RECOMMENDED_FREE_BYTES,
    warning:
      freeBytes != null && freeBytes < MIN_RECOMMENDED_FREE_BYTES
        ? '可用空间少于 10 GB，生成图片或视频时可能很快用满。'
        : ''
  };
}

async function copyMissing(source, destination) {
  if (!fs.existsSync(source)) return;
  const sourceStats = await fsp.stat(source);
  if (sourceStats.isDirectory()) {
    await fsp.mkdir(destination, { recursive: true });
    const entries = await fsp.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyMissing(path.join(source, entry.name), path.join(destination, entry.name));
    }
    return;
  }
  if (fs.existsSync(destination)) return;
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.copyFile(source, destination);
}

async function initializeStorage(root, appDir) {
  const layout = storageLayout(root);
  await Promise.all([
    fsp.mkdir(layout.data, { recursive: true }),
    fsp.mkdir(layout.assets, { recursive: true }),
    fsp.mkdir(layout.output, { recursive: true }),
    fsp.mkdir(layout.workflows, { recursive: true }),
    fsp.mkdir(layout.config, { recursive: true })
  ]);

  // Seed bundled defaults and copy legacy user files once. Existing destination
  // files always win, so upgrades cannot overwrite user content.
  await copyMissing(path.join(appDir, 'data'), layout.data);
  await copyMissing(path.join(appDir, 'assets'), layout.assets);
  await copyMissing(path.join(appDir, 'output'), layout.output);
  await copyMissing(path.join(appDir, 'workflows'), layout.workflows);
  await copyMissing(path.join(appDir, 'API', '.env'), layout.apiEnv);
  await copyMissing(path.join(appDir, 'history.json'), path.join(layout.data, 'history.json'));
  return layout;
}

async function completeStorageSetup(userData, root, appDir, forbiddenRoot = '') {
  const validation = await validateStorageRoot(root, forbiddenRoot);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = 'INVALID_STORAGE_ROOT';
    throw error;
  }
  await initializeStorage(validation.root, appDir);
  const state = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    completed: true,
    root: validation.root,
    configuredAt: new Date().toISOString()
  };
  await fsp.mkdir(userData, { recursive: true });
  await fsp.writeFile(storageStatePath(userData), JSON.stringify(state, null, 2), 'utf8');
  return { ...state, ...validation, layout: storageLayout(validation.root) };
}

async function resolveStorage(userData, appDir, options = {}) {
  const state = await readStorageState(userData);
  const root = state?.root || defaultStorageRoot(userData);
  if (options.initialize !== false) await initializeStorage(root, appDir);
  return { root: path.resolve(root), state, layout: storageLayout(root) };
}

function applyStorageEnvironment(env, layout) {
  return {
    ...env,
    INFINITE_CANVAS_STORAGE_ROOT: layout.root,
    INFINITE_CANVAS_DATA_DIR: layout.data,
    INFINITE_CANVAS_ASSETS_DIR: layout.assets,
    INFINITE_CANVAS_OUTPUT_DIR: layout.output,
    INFINITE_CANVAS_WORKFLOW_DIR: layout.workflows,
    INFINITE_CANVAS_API_ENV_FILE: layout.apiEnv
  };
}

module.exports = {
  STORAGE_SCHEMA_VERSION,
  MIN_RECOMMENDED_FREE_BYTES,
  storageStatePath,
  defaultStorageRoot,
  storageLayout,
  readStorageState,
  needsStorageSetup,
  validateStorageRoot,
  initializeStorage,
  completeStorageSetup,
  resolveStorage,
  applyStorageEnvironment,
  formatBytes
};
