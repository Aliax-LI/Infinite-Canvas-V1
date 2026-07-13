const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const STORAGE_SCHEMA_VERSION = 1;
const MIN_RECOMMENDED_FREE_BYTES = 10 * 1024 * 1024 * 1024;

function storageStatePath(userData) {
  return path.join(userData, 'storage-state.json');
}

/**
 * Default Settings「数据目录」: Electron userData/data (Windows: LOCALAPPDATA/Infinite Canvas/data).
 * Override by completing first-run storage setup or setting INFINITE_CANVAS_DATA_DIR.
 */
function defaultStorageRoot(userData) {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Infinite Canvas', 'data');
  }
  return path.join(userData, 'data');
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

async function writeStorageState(userData, state) {
  await fsp.mkdir(userData, { recursive: true });
  await fsp.writeFile(storageStatePath(userData), JSON.stringify(state, null, 2), 'utf8');
}

async function needsStorageSetup(userData) {
  const state = await readStorageState(userData);
  return !(state?.completed && state.schemaVersion === STORAGE_SCHEMA_VERSION);
}

/**
 * Chosen folder IS Settings「数据目录」(DATA_DIR). All writable trees nest under it.
 * Layout matches backend/config.py defaults so Electron and FastAPI agree.
 */
function storageLayout(dataDir) {
  const resolved = path.resolve(dataDir);
  const objects = path.join(resolved, 'objects');
  return {
    root: resolved,
    data: resolved,
    assets: objects,
    objects,
    output: path.join(resolved, 'output'),
    workflows: path.join(resolved, 'workflows'),
    config: path.join(resolved, 'config'),
    apiEnv: path.join(resolved, 'config', 'api.env'),
    minio: path.join(resolved, 'minio')
  };
}

/**
 * Older packaged builds used parent/storage with sibling data/, objects/, exports/.
 * Settings showed parent/data — remap so DATA_DIR is the single root.
 */
function resolveEffectiveDataDir(configuredRoot) {
  const resolved = path.resolve(configuredRoot);
  const nestedData = path.join(resolved, 'data');
  const siblingObjects = path.join(resolved, 'objects');
  const siblingExports = path.join(resolved, 'exports');
  const looksLikeParentLayout =
    fs.existsSync(nestedData) &&
    (fs.existsSync(siblingObjects) || fs.existsSync(siblingExports)) &&
    !fs.existsSync(path.join(resolved, 'projects.json')) &&
    !fs.existsSync(path.join(resolved, 'canvases'));
  if (looksLikeParentLayout) {
    return nestedData;
  }
  return resolved;
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

async function initializeStorage(dataDir, appDir, options = {}) {
  const layout = storageLayout(dataDir);
  await Promise.all([
    fsp.mkdir(layout.data, { recursive: true }),
    fsp.mkdir(layout.objects, { recursive: true }),
    fsp.mkdir(layout.output, { recursive: true }),
    fsp.mkdir(layout.workflows, { recursive: true }),
    fsp.mkdir(layout.config, { recursive: true })
  ]);

  // Seed bundled defaults and copy legacy user files once. Existing destination
  // files always win, so upgrades cannot overwrite user content.
  await copyMissing(path.join(appDir, 'data'), layout.data);
  await copyMissing(path.join(appDir, 'assets'), layout.objects);
  await copyMissing(path.join(appDir, 'output'), layout.output);
  await copyMissing(path.join(appDir, 'workflows'), layout.workflows);
  await copyMissing(path.join(appDir, 'API', '.env'), layout.apiEnv);
  await copyMissing(path.join(appDir, 'history.json'), path.join(layout.data, 'history.json'));

  // Consolidate old sibling layout (parent/objects, parent/exports) under DATA_DIR.
  if (options.legacyParent) {
    const parent = path.resolve(options.legacyParent);
    await copyMissing(path.join(parent, 'objects'), layout.objects);
    await copyMissing(path.join(parent, 'exports'), layout.output);
    await copyMissing(path.join(parent, 'assets'), layout.objects);
    await copyMissing(path.join(parent, 'workflows'), layout.workflows);
    await copyMissing(path.join(parent, 'config', 'api.env'), layout.apiEnv);
  }
  return layout;
}

async function completeStorageSetup(userData, root, appDir, forbiddenRoot = '') {
  const validation = await validateStorageRoot(root, forbiddenRoot);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = 'INVALID_STORAGE_ROOT';
    throw error;
  }
  const dataDir = validation.root;
  await initializeStorage(dataDir, appDir);
  const state = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    completed: true,
    root: dataDir,
    configuredAt: new Date().toISOString()
  };
  await writeStorageState(userData, state);
  return { ...state, ...validation, layout: storageLayout(dataDir) };
}

async function resolveStorage(userData, appDir, options = {}) {
  const state = await readStorageState(userData);
  const configured = state?.root || defaultStorageRoot(userData);
  const configuredResolved = path.resolve(configured);
  const dataDir = resolveEffectiveDataDir(configuredResolved);
  const legacyParent = dataDir !== configuredResolved ? configuredResolved : null;
  if (options.initialize !== false) {
    await initializeStorage(dataDir, appDir, { legacyParent });
  }
  if (state && path.resolve(state.root) !== path.resolve(dataDir)) {
    await writeStorageState(userData, {
      ...state,
      root: dataDir,
      migratedFrom: state.root,
      migratedAt: new Date().toISOString()
    });
  }
  return { root: path.resolve(dataDir), state, layout: storageLayout(dataDir) };
}

function applyStorageEnvironment(env, layout) {
  return {
    ...env,
    INFINITE_CANVAS_DATA_DIR: layout.data,
    INFINITE_CANVAS_OBJECTS_DIR: layout.objects,
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
  resolveEffectiveDataDir,
  readStorageState,
  needsStorageSetup,
  validateStorageRoot,
  initializeStorage,
  completeStorageSetup,
  resolveStorage,
  applyStorageEnvironment,
  formatBytes
};
