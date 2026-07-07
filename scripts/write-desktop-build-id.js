#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim().split(/\r?\n/)[0].trim();
let sha = 'local';
try {
  sha = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch (_) {}
const buildId = `${version}+${sha}`;
fs.writeFileSync(path.join(root, 'DESKTOP_BUILD_ID'), `${buildId}\n`, 'utf8');
console.log(`DESKTOP_BUILD_ID=${buildId}`);
