const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { PIP_MIRRORS } = require('./mirrors');
const {
  bundledPythonDir,
  bundledPythonExecutables,
  ensureBundledPython
} = require('./python-installer');
const IMPORT_CHECK =
  'import fastapi,uvicorn,requests,pydantic,multipart,httpx; from PIL import Image';
const PYTHON_NOT_FOUND_HINT =
  '自动安装 Python 失败。请检查网络连接后重试，或设置环境变量 INFINITE_CANVAS_PYTHON 指向本机 python3 可执行文件。';

let resolvedPython = null;
let resolvedRuntimePython = null;

function venvDirPath(userData) {
  return path.join(userData, 'venv');
}

function venvPythonPath(userData) {
  if (process.platform === 'win32') {
    return path.join(venvDirPath(userData), 'Scripts', 'python.exe');
  }
  return path.join(venvDirPath(userData), 'bin', 'python3');
}

function projectVenvPythonPath(appDir) {
  const venvDir = path.join(appDir, 'venv');
  const pythonPath =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python3');
  return fs.existsSync(pythonPath) ? pythonPath : null;
}

function venvBasePythonMetaPath(userData) {
  return path.join(venvDirPath(userData), '.infinite-canvas-base-python');
}

function normalizePythonPath(command) {
  if (!command) return command;
  try {
    if (isAbsoluteCandidate(command)) return path.resolve(command);
  } catch (_) {}
  return command;
}

function isBundledPython(command, userData) {
  if (!command || !userData) return false;
  try {
    const resolved = path.resolve(command);
    const bundled = path.resolve(bundledPythonDir(userData));
    return resolved === bundled || resolved.startsWith(`${bundled}${path.sep}`);
  } catch (_) {
    return false;
  }
}

async function isExternallyManaged(command) {
  try {
    const { stdout, stderr } = await runCommand(
      command,
      pythonArgs(command, [
        '-c',
        [
          'import os, sys',
          'for prefix in (sys.prefix, getattr(sys, "base_prefix", sys.prefix)):',
          '    if os.path.isfile(os.path.join(prefix, "EXTERNALLY-MANAGED")):',
          '        print("yes")',
          '        break'
        ].join('\n')
      ])
    );
    return `${stdout}${stderr}`.includes('yes');
  } catch (_) {
    return false;
  }
}

function expandHome(candidate) {
  if (candidate.startsWith('~/')) return path.join(os.homedir(), candidate.slice(2));
  return candidate;
}

function expandCliPath(pathValue) {
  const home = os.homedir();
  const extra = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.codex', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ];
  const nvmBase = path.join(home, '.nvm', 'versions', 'node');
  try {
    if (fs.existsSync(nvmBase)) {
      for (const entry of fs.readdirSync(nvmBase)) {
        extra.push(path.join(nvmBase, entry, 'bin'));
      }
    }
  } catch (_) {}
  if (process.platform === 'win32') {
    if (process.env.APPDATA) extra.push(path.join(process.env.APPDATA, 'npm'));
    if (process.env.LOCALAPPDATA) extra.push(path.join(process.env.LOCALAPPDATA, 'npm'));
  }
  const current = (pathValue || '').split(path.delimiter).filter(Boolean);
  const seen = new Set();
  const merged = [];
  for (const entry of [...extra, ...current]) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    merged.push(entry);
  }
  return merged.join(path.delimiter);
}

function isAbsoluteCandidate(candidate) {
  return path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate);
}

function condaPythonPaths() {
  const paths = [];
  if (process.env.CONDA_PREFIX) {
    paths.push(path.join(process.env.CONDA_PREFIX, 'bin', 'python3'));
    if (process.platform === 'win32') {
      paths.push(path.join(process.env.CONDA_PREFIX, 'python.exe'));
    }
  }
  const home = os.homedir();
  const dirs = ['miniconda3', 'anaconda3', 'mambaforge', 'miniforge3'];
  for (const dir of dirs) {
    if (process.platform === 'win32') {
      paths.push(path.join(home, dir, 'python.exe'));
      paths.push(path.join(home, dir, 'Scripts', 'python.exe'));
    } else {
      paths.push(path.join(home, dir, 'bin', 'python3'));
    }
  }
  return paths;
}

function macPythonPaths() {
  return [
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/Current/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3'
  ];
}

function winPythonPaths() {
  const paths = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const versions = ['313', '312', '311', '310'];
  if (localAppData) {
    for (const ver of versions) {
      paths.push(path.join(localAppData, 'Programs', 'Python', `Python${ver}`, 'python.exe'));
    }
  }
  if (programFiles) {
    for (const ver of versions) {
      paths.push(path.join(programFiles, `Python${ver}`, 'python.exe'));
    }
  }
  return paths;
}

function linuxPythonPaths() {
  return ['/usr/bin/python3', '/usr/local/bin/python3'];
}

function pythonCandidates(userData) {
  const candidates = [];
  const seen = new Set();
  const add = raw => {
    if (!raw) return;
    const candidate = expandHome(raw);
    if (seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };

  if (process.env.INFINITE_CANVAS_PYTHON) add(process.env.INFINITE_CANVAS_PYTHON);
  if (userData) bundledPythonExecutables(userData).forEach(add);

  if (process.platform === 'win32') {
    add('py');
    add('python');
    add('python3');
    winPythonPaths().forEach(add);
  } else if (process.platform === 'darwin') {
    add('python3');
    add('python');
    macPythonPaths().forEach(add);
  } else {
    add('python3');
    add('python');
    linuxPythonPaths().forEach(add);
  }

  condaPythonPaths().forEach(add);
  return candidates;
}

function candidateExists(candidate) {
  if (!isAbsoluteCandidate(candidate)) return true;
  try {
    return fs.existsSync(candidate);
  } catch (_) {
    return false;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const emit = chunk => {
      const text = chunk.toString();
      options.onOutput?.(text);
      return text;
    };
    child.stdout?.on('data', chunk => {
      stdout += emit(chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr += emit(chunk);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `命令退出码 ${code}`).trim()));
    });
  });
}

function pythonArgs(command, extraArgs) {
  if (command === 'py') return ['-3', ...extraArgs];
  return extraArgs;
}

function pipArgs(command, extraArgs) {
  return pythonArgs(command, ['-m', 'pip', ...extraArgs]);
}

async function probePython(candidate) {
  try {
    const { stdout, stderr } = await runCommand(candidate, pythonArgs(candidate, ['--version']));
    const text = `${stdout}${stderr}`.trim();
    const match = text.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
    if (!match) return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major < 3 || (major === 3 && minor < 10)) return null;
    return {
      command: candidate,
      version: `${major}.${minor}${match[3] ? `.${match[3]}` : ''}`
    };
  } catch (_) {
    return null;
  }
}

async function findPython(userData) {
  for (const candidate of pythonCandidates(userData)) {
    if (!candidateExists(candidate)) continue;
    const info = await probePython(candidate);
    if (info) {
      resolvedPython = info.command;
      return info;
    }
  }
  return null;
}

async function resolvePythonExecutable(userData) {
  const info = await findPython(userData);
  return info ? info.command : null;
}

async function ensurePython(userData, callbacks = {}) {
  const { onStatus, onOutput } = callbacks;
  onStatus?.('detecting', '正在检测 Python 环境...');
  let python = await findPython(userData);
  if (python) {
    onStatus?.('python', `已找到 Python ${python.version}`);
    onOutput?.(`已找到 Python ${python.version} (${python.command})\n`);
    return python.command;
  }
  const command = await ensureBundledPython(userData, callbacks);
  resolvedPython = command;
  return command;
}

function getResolvedPython() {
  return resolvedRuntimePython || resolvedPython;
}

function getResolvedBasePython() {
  return resolvedPython;
}

async function checkDependencies(command) {
  try {
    await runCommand(command, pythonArgs(command, ['-c', IMPORT_CHECK]));
    return true;
  } catch (_) {
    return false;
  }
}

function requirementsHash(appDir) {
  const reqPath = path.join(appDir, 'requirements.txt');
  if (!fs.existsSync(reqPath)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(reqPath, 'utf8')).digest('hex');
}

function depsStatePath(userData) {
  return path.join(userData, 'deps-state.json');
}

async function readDepsState(userData) {
  try {
    return JSON.parse(await fsp.readFile(depsStatePath(userData), 'utf8'));
  } catch (_) {
    return null;
  }
}

async function writeDepsState(userData, state) {
  await fsp.mkdir(userData, { recursive: true });
  await fsp.writeFile(depsStatePath(userData), JSON.stringify(state, null, 2), 'utf8');
}

async function ensurePip(command, onOutput) {
  try {
    await runCommand(command, pipArgs(command, ['--version']));
    return;
  } catch (_) {
    onOutput?.('正在初始化 pip...\n');
    await runCommand(command, pythonArgs(command, ['-m', 'ensurepip', '--upgrade']), { onOutput });
  }
}

async function ensureVenv(basePython, userData, onOutput) {
  await fsp.mkdir(userData, { recursive: true });
  const normalizedBase = normalizePythonPath(basePython);
  const venvDir = venvDirPath(userData);
  const venvPython = venvPythonPath(userData);
  const metaPath = venvBasePythonMetaPath(userData);

  let needsRecreate = !fs.existsSync(venvPython);
  if (!needsRecreate) {
    try {
      const stored = normalizePythonPath((await fsp.readFile(metaPath, 'utf8')).trim());
      if (stored !== normalizedBase) needsRecreate = true;
    } catch (_) {
      needsRecreate = true;
    }
  }

  if (needsRecreate) {
    if (fs.existsSync(venvDir)) {
      onOutput?.('正在重建隔离 Python 环境（venv）...\n');
      await fsp.rm(venvDir, { recursive: true, force: true });
    } else {
      onOutput?.('正在创建隔离 Python 环境（venv）...\n');
    }
    await runCommand(basePython, pythonArgs(basePython, ['-m', 'venv', venvDir]), { onOutput });
    await fsp.writeFile(metaPath, normalizedBase, 'utf8');
  }

  if (!fs.existsSync(venvPython)) {
    throw new Error('虚拟环境创建失败，请检查 Python 安装是否完整。');
  }
  return venvPython;
}

async function resolveDevRuntimePython(basePython, appDir, userData, callbacks = {}) {
  const { onOutput } = callbacks;
  const externallyManaged = await isExternallyManaged(basePython);
  if (!externallyManaged && (await checkDependencies(basePython))) {
    onOutput?.('开发模式：使用本机 Python（依赖已满足）\n');
    return basePython;
  }
  const projectVenv = projectVenvPythonPath(appDir);
  if (projectVenv && (await checkDependencies(projectVenv))) {
    onOutput?.('开发模式：使用项目 venv（依赖已满足）\n');
    return projectVenv;
  }
  return resolveRuntimePython(basePython, userData, callbacks);
}

async function resolveRuntimePython(basePython, userData, callbacks = {}) {
  if (isBundledPython(basePython, userData)) {
    return basePython;
  }

  const { onOutput } = callbacks;
  const externallyManaged = await isExternallyManaged(basePython);
  if (externallyManaged) {
    onOutput?.('检测到系统 Python 受 PEP 668 保护，将使用独立虚拟环境安装依赖。\n');
  } else {
    onOutput?.('将使用独立虚拟环境安装依赖，避免影响系统 Python。\n');
  }
  return ensureVenv(basePython, userData, onOutput);
}

async function runPipInstall(command, pipExtraArgs, onOutput) {
  let lastError = null;
  for (const mirror of PIP_MIRRORS) {
    onOutput?.(`使用镜像：${mirror.index}\n`);
    try {
      await runCommand(
        command,
        pipArgs(command, [
          'install',
          ...pipExtraArgs,
          '-i',
          mirror.index,
          '--trusted-host',
          mirror.host
        ]),
        { onOutput }
      );
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('依赖安装失败');
}

async function installDependencies(command, appDir, onOutput) {
  await ensurePip(command, onOutput);
  onOutput?.('正在从国内镜像安装 Python 依赖，请稍候...\n');
  await runPipInstall(command, ['-r', path.join(appDir, 'requirements.txt')], onOutput);
  onOutput?.('正在安装 WebSocket 支持...\n');
  await runPipInstall(command, ['uvicorn[standard]'], onOutput);
  onOutput?.('依赖包安装完成。\n');
}

async function needsDependencySetup(appDir, userData, options = {}) {
  const { isDev = false } = options;
  const python = await findPython(userData);
  if (!python) return true;

  const reqHash = requirementsHash(appDir);
  const state = await readDepsState(userData);

  if (isDev) {
    const externallyManaged = await isExternallyManaged(python.command);
    if (!externallyManaged && (await checkDependencies(python.command))) return false;
    const projectVenv = projectVenvPythonPath(appDir);
    if (projectVenv && (await checkDependencies(projectVenv))) return false;
  }

  if (
    state?.ok &&
    state.requirementsHash === reqHash &&
    state.runtimePython &&
    fs.existsSync(state.runtimePython) &&
    (await checkDependencies(state.runtimePython))
  ) {
    return false;
  }

  const existingVenv = venvPythonPath(userData);
  if (fs.existsSync(existingVenv) && (await checkDependencies(existingVenv))) return false;

  return true;
}

async function ensureDependencies(appDir, userData, callbacks = {}) {
  const { onStatus, onOutput, isDev = false } = callbacks;
  const basePython = await ensurePython(userData, callbacks);
  const runtimePython = isDev
    ? await resolveDevRuntimePython(basePython, appDir, userData, callbacks)
    : await resolveRuntimePython(basePython, userData, callbacks);
  resolvedRuntimePython = runtimePython;
  const venvPath = isBundledPython(basePython, userData) ? null : venvDirPath(userData);

  const reqHash = requirementsHash(appDir);
  const state = await readDepsState(userData);
  const cacheValid =
    state &&
    state.ok &&
    state.python === basePython &&
    state.runtimePython === runtimePython &&
    state.requirementsHash === reqHash;

  if (cacheValid) {
    onStatus?.('ready', '依赖已就绪');
    return runtimePython;
  }

  onStatus?.('checking', '正在检查 Python 依赖...');
  const depsOk = await checkDependencies(runtimePython);
  if (depsOk && state?.requirementsHash === reqHash && state?.runtimePython === runtimePython) {
    await writeDepsState(userData, {
      ok: true,
      python: basePython,
      runtimePython,
      venvPath,
      requirementsHash: reqHash,
      updatedAt: new Date().toISOString()
    });
    onStatus?.('ready', '依赖已就绪');
    return runtimePython;
  }

  onStatus?.('installing', '正在自动安装依赖（清华镜像）...');
  await installDependencies(runtimePython, appDir, onOutput);
  onStatus?.('verifying', '依赖安装完成，正在验证...');
  const verified = await checkDependencies(runtimePython);
  if (!verified) {
    throw new Error('依赖安装完成，但验证失败，请检查网络后重试。');
  }
  await writeDepsState(userData, {
    ok: true,
    python: basePython,
    runtimePython,
    venvPath,
    requirementsHash: reqHash,
    updatedAt: new Date().toISOString()
  });
  onStatus?.('ready', '依赖安装完成');
  return runtimePython;
}

module.exports = {
  PIP_MIRRORS,
  PYTHON_NOT_FOUND_HINT,
  findPython,
  ensurePython,
  resolvePythonExecutable,
  resolveRuntimePython,
  getResolvedPython,
  getResolvedBasePython,
  ensureDependencies,
  needsDependencySetup,
  checkDependencies,
  pythonCandidates,
  expandCliPath,
  isBundledPython,
  isExternallyManaged,
  venvDirPath,
  venvPythonPath,
  projectVenvPythonPath
};
