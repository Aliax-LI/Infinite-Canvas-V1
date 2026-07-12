const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');

const {
  storageLayout,
  needsStorageSetup,
  validateStorageRoot,
  completeStorageSetup,
  resolveStorage,
  applyStorageEnvironment
} = require('../../../electron/storage-setup');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-canvas-storage-'));
  const userData = path.join(root, 'user-data');
  const appDir = path.join(root, 'runtime');
  await fs.mkdir(path.join(appDir, 'data'), { recursive: true });
  await fs.mkdir(path.join(appDir, 'workflows'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'data', 'projects.json'), '{"projects":[]}', 'utf8');
  await fs.writeFile(path.join(appDir, 'workflows', 'default.json'), '{}', 'utf8');
  return { root, userData, appDir };
}

test('validates writable roots and rejects the application directory', async t => {
  const { root, appDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const allowed = await validateStorageRoot(path.join(root, 'storage'), appDir);
  assert.equal(allowed.ok, true);
  assert.equal(path.isAbsolute(allowed.root), true);

  const rejected = await validateStorageRoot(path.join(appDir, 'data'), appDir);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /安装目录/);
});

test('initializes the layout, seeds legacy files, and persists the choice', async t => {
  const { root, userData, appDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const selected = path.join(root, 'selected-storage');

  assert.equal(await needsStorageSetup(userData), true);
  const completed = await completeStorageSetup(userData, selected, appDir, appDir);
  assert.equal(completed.completed, true);
  assert.equal(await needsStorageSetup(userData), false);
  assert.equal(
    await fs.readFile(path.join(selected, 'data', 'projects.json'), 'utf8'),
    '{"projects":[]}'
  );
  assert.equal(await fs.readFile(path.join(selected, 'workflows', 'default.json'), 'utf8'), '{}');

  const resolved = await resolveStorage(userData, appDir);
  assert.equal(resolved.root, path.resolve(selected));
});

test('maps the selected layout to backend environment variables', () => {
  const layout = storageLayout(path.join(os.tmpdir(), 'canvas-data'));
  const env = applyStorageEnvironment({ KEEP: 'yes' }, layout);
  assert.equal(env.KEEP, 'yes');
  assert.equal(env.INFINITE_CANVAS_DATA_DIR, layout.data);
  assert.equal(env.INFINITE_CANVAS_ASSETS_DIR, layout.assets);
  assert.equal(env.INFINITE_CANVAS_OUTPUT_DIR, layout.output);
  assert.equal(env.INFINITE_CANVAS_WORKFLOW_DIR, layout.workflows);
  assert.equal(env.INFINITE_CANVAS_API_ENV_FILE, layout.apiEnv);
});

