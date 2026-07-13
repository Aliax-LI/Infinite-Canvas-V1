const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');

const {
  storageLayout,
  resolveEffectiveDataDir,
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

test('initializes layout under the chosen data dir and persists the choice', async t => {
  const { root, userData, appDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const selected = path.join(root, 'selected-data');

  assert.equal(await needsStorageSetup(userData), true);
  const completed = await completeStorageSetup(userData, selected, appDir, appDir);
  assert.equal(completed.completed, true);
  assert.equal(await needsStorageSetup(userData), false);
  assert.equal(
    await fs.readFile(path.join(selected, 'projects.json'), 'utf8'),
    '{"projects":[]}'
  );
  assert.equal(await fs.readFile(path.join(selected, 'workflows', 'default.json'), 'utf8'), '{}');
  assert.equal(fssync.existsSync(path.join(selected, 'objects')), true);
  assert.equal(fssync.existsSync(path.join(selected, 'output')), true);

  const resolved = await resolveStorage(userData, appDir);
  assert.equal(resolved.root, path.resolve(selected));
  assert.equal(resolved.layout.data, path.resolve(selected));
  assert.equal(resolved.layout.objects, path.join(path.resolve(selected), 'objects'));
});

test('maps the selected layout to backend environment variables under one data root', () => {
  const layout = storageLayout(path.join(os.tmpdir(), 'canvas-data'));
  const env = applyStorageEnvironment({ KEEP: 'yes' }, layout);
  assert.equal(env.KEEP, 'yes');
  assert.equal(env.INFINITE_CANVAS_DATA_DIR, layout.data);
  assert.equal(env.INFINITE_CANVAS_OBJECTS_DIR, layout.objects);
  assert.equal(env.INFINITE_CANVAS_ASSETS_DIR, layout.assets);
  assert.equal(env.INFINITE_CANVAS_OUTPUT_DIR, layout.output);
  assert.equal(env.INFINITE_CANVAS_WORKFLOW_DIR, layout.workflows);
  assert.equal(env.INFINITE_CANVAS_API_ENV_FILE, layout.apiEnv);
  assert.equal(layout.data, layout.root);
  assert.equal(layout.assets, layout.objects);
});

test('seeds bundled assets into DATA_DIR/objects without overwriting', async t => {
  const { root, userData, appDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(appDir, 'assets', 'input'), { recursive: true });
  await fs.writeFile(path.join(appDir, 'assets', 'input', 'legacy.png'), 'from-app', 'utf8');
  const selected = path.join(root, 'selected-data');
  await fs.mkdir(path.join(selected, 'objects', 'input'), { recursive: true });
  await fs.writeFile(path.join(selected, 'objects', 'input', 'keep.png'), 'keep', 'utf8');

  await completeStorageSetup(userData, selected, appDir, appDir);

  assert.equal(
    await fs.readFile(path.join(selected, 'objects', 'input', 'legacy.png'), 'utf8'),
    'from-app'
  );
  assert.equal(
    await fs.readFile(path.join(selected, 'objects', 'input', 'keep.png'), 'utf8'),
    'keep'
  );
});

test('rewrites old parent storage layout to nested data dir', async t => {
  const { root, userData, appDir } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const parent = path.join(root, 'legacy-storage');
  const nestedData = path.join(parent, 'data');
  await fs.mkdir(nestedData, { recursive: true });
  await fs.mkdir(path.join(parent, 'objects', 'output'), { recursive: true });
  await fs.mkdir(path.join(parent, 'exports'), { recursive: true });
  await fs.writeFile(path.join(nestedData, 'projects.json'), '{"projects":[]}', 'utf8');
  await fs.writeFile(path.join(parent, 'objects', 'output', 'a.png'), 'png', 'utf8');
  await fs.mkdir(userData, { recursive: true });
  await fs.writeFile(path.join(userData, 'storage-state.json'), JSON.stringify({
    schemaVersion: 1,
    completed: true,
    root: parent
  }), 'utf8');

  assert.equal(resolveEffectiveDataDir(parent), nestedData);

  const resolved = await resolveStorage(userData, appDir);
  assert.equal(resolved.root, path.resolve(nestedData));
  assert.equal(
    await fs.readFile(path.join(nestedData, 'objects', 'output', 'a.png'), 'utf8'),
    'png'
  );
  const state = JSON.parse(await fs.readFile(path.join(userData, 'storage-state.json'), 'utf8'));
  assert.equal(state.root, path.resolve(nestedData));
});
