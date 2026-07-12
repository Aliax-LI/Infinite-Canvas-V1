const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');

test('setup sidebar follows the application shell dimensions and step pattern', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'electron', 'setup.html'), 'utf8');

  assert.match(html, /width:\s*72px;\s*min-width:\s*72px/);
  assert.match(html, /\.logo-ring img \{ width: 20px; height: 20px;/);
  assert.match(html, /width:\s*48px;\s*height:\s*48px;\s*flex:\s*0 0 48px/);
  assert.match(html, /id="step-dot-1"[^>]*>01<\/span>/);
  assert.match(html, /id="step-dot-4"[^>]*>04<\/span>/);
  assert.match(html, /id="sidebar-step-current">1<\/span>/);
  assert.doesNotMatch(html, />Setup<\/div>/);
});

test('packaged app resolves the same logo asset shipped by Vite', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.js'), 'utf8');
  assert.match(main, /'frontend', 'dist', 'images', 'logo\.png'/);
});

