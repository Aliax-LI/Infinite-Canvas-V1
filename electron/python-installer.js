const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const PYTHON_VERSION = '3.12.8';
const { WINDOWS_PYTHON_URLS, MAC_MINIFORGE_URLS } = require('./mirrors');

function bundledPythonDir(userData) {
  return path.join(userData, 'python');
}

function bundledPythonExecutables(userData) {
  const base = bundledPythonDir(userData);
  if (process.platform === 'win32') {
    return [path.join(base, 'python.exe')];
  }
  return [path.join(base, 'bin', 'python3'), path.join(base, 'bin', 'python')];
}

function pythonStatePath(userData) {
  return path.join(userData, 'python-state.json');
}

async function readPythonState(userData) {
  try {
    return JSON.parse(await fsp.readFile(pythonStatePath(userData), 'utf8'));
  } catch (_) {
    return null;
  }
}

async function writePythonState(userData, state) {
  await fsp.mkdir(userData, { recursive: true });
  await fsp.writeFile(pythonStatePath(userData), JSON.stringify(state, null, 2), 'utf8');
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

function followRedirect(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        followRedirect(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`下载失败 HTTP ${res.statusCode}: ${url}`));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error(`下载超时: ${url}`));
    });
  });
}

async function downloadFile(url, destPath, onOutput) {
  onOutput?.(`正在下载：${url}\n`);
  const res = await followRedirect(url);
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const file = fs.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    res.pipe(file);
    file.on('finish', resolve);
    file.on('error', reject);
    res.on('error', reject);
  });
  file.close();
  const stat = await fsp.stat(destPath);
  if (!stat.size) throw new Error('下载文件为空');
  onOutput?.(`下载完成（${Math.round(stat.size / 1024 / 1024)} MB）\n`);
}

async function downloadWithMirrors(urls, destPath, onOutput) {
  let lastError = null;
  for (const url of urls) {
    try {
      await downloadFile(url, destPath, onOutput);
      return;
    } catch (err) {
      lastError = err;
      onOutput?.(`镜像失败：${err.message}\n`);
      try {
        await fsp.unlink(destPath);
      } catch (_) {}
    }
  }
  throw lastError || new Error('所有下载镜像均失败');
}

async function extractZip(zipPath, destDir, onOutput) {
  onOutput?.('正在解压 Python 运行环境...\n');
  await fsp.mkdir(destDir, { recursive: true });
  if (process.platform === 'win32') {
    await runCommand(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
      ],
      { onOutput }
    );
  } else {
    await runCommand('tar', ['-xf', zipPath, '-C', destDir], { onOutput });
  }
}

function winEmbedArch() {
  return process.arch === 'x64' || process.arch === 'arm64' ? 'amd64' : 'win32';
}

function macArch() {
  return process.arch === 'arm64' ? 'arm64' : 'x86_64';
}

function embedPthName() {
  const [major, minor] = PYTHON_VERSION.split('.');
  return `python${major}${minor}._pth`;
}

async function configureWindowsEmbeddable(installDir, onOutput) {
  const pthName = embedPthName();
  const pthPath = path.join(installDir, pthName);
  if (!fs.existsSync(pthPath)) {
    throw new Error(`未找到 ${pthName}，解压结果异常`);
  }
  const original = await fsp.readFile(pthPath, 'utf8');
  const lines = original
    .split(/\r?\n/)
    .map(line => (line.trim() === '#import site' ? 'import site' : line))
    .filter((line, idx, arr) => {
      if (line === 'Lib\\site-packages' || line === 'Lib/site-packages') return false;
      return true;
    });
  if (!lines.some(line => line === 'import site')) lines.push('import site');
  if (!lines.some(line => line.replace(/\//g, '\\') === 'Lib\\site-packages')) {
    lines.push('Lib\\site-packages');
  }
  await fsp.writeFile(pthPath, `${lines.join('\r\n')}\r\n`, 'utf8');
  onOutput?.('已配置嵌入式 Python 的 site-packages...\n');

  const pythonExe = path.join(installDir, 'python.exe');
  const getPipPath = path.join(installDir, 'get-pip.py');
  await downloadWithMirrors(
    [
      'https://bootstrap.pypa.io/get-pip.py',
      'https://mirrors.aliyun.com/pypi/get-pip/get-pip.py'
    ],
    getPipPath,
    onOutput
  );
  onOutput?.('正在初始化 pip...\n');
  await runCommand(pythonExe, [getPipPath, '--no-warn-script-location'], { onOutput });
  try {
    await fsp.unlink(getPipPath);
  } catch (_) {}
}

async function installWindowsPython(userData, callbacks = {}) {
  const { onOutput } = callbacks;
  const installDir = bundledPythonDir(userData);
  const arch = winEmbedArch();
  const zipName = `python-${PYTHON_VERSION}-embed-${arch}.zip`;
  const zipPath = path.join(userData, 'downloads', zipName);

  await fsp.rm(installDir, { recursive: true, force: true });
  await downloadWithMirrors(WINDOWS_PYTHON_URLS(arch), zipPath, onOutput);
  await extractZip(zipPath, installDir, onOutput);
  await configureWindowsEmbeddable(installDir, onOutput);

  const pythonExe = path.join(installDir, 'python.exe');
  if (!fs.existsSync(pythonExe)) throw new Error('Windows Python 安装后未找到 python.exe');
  return pythonExe;
}

async function installMacPython(userData, callbacks = {}) {
  const { onOutput } = callbacks;
  const installDir = bundledPythonDir(userData);
  const arch = macArch();
  const shName = `Miniforge3-MacOSX-${arch}.sh`;
  const shPath = path.join(userData, 'downloads', shName);

  await fsp.rm(installDir, { recursive: true, force: true });
  await downloadWithMirrors(MAC_MINIFORGE_URLS(arch), shPath, onOutput);
  onOutput?.('正在静默安装 Miniforge Python（无需管理员权限）...\n');
  await runCommand('bash', [shPath, '-b', '-p', installDir], { onOutput });

  const pythonExe = path.join(installDir, 'bin', 'python3');
  if (!fs.existsSync(pythonExe)) throw new Error('macOS Python 安装后未找到 python3');
  return pythonExe;
}

async function installBundledPython(userData, callbacks = {}) {
  if (process.platform === 'win32') return installWindowsPython(userData, callbacks);
  if (process.platform === 'darwin') return installMacPython(userData, callbacks);
  throw new Error('当前平台暂不支持自动安装 Python，请手动安装 Python 3.10+。');
}

async function probeBundledPython(command) {
  try {
    const { stdout, stderr } = await runCommand(command, ['--version']);
    const text = `${stdout}${stderr}`.trim();
    const match = text.match(/Python\s+(\d+)\.(\d+)/i);
    if (!match) return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major < 3 || (major === 3 && minor < 10)) return null;
    return { command, version: `${major}.${minor}` };
  } catch (_) {
    return null;
  }
}

async function ensureBundledPython(userData, callbacks = {}) {
  const { onStatus, onOutput } = callbacks;
  for (const exe of bundledPythonExecutables(userData)) {
    if (!fs.existsSync(exe)) continue;
    const info = await probeBundledPython(exe);
    if (info) {
      onOutput?.(`已使用内置 Python ${info.version}（${exe}）\n`);
      return info.command;
    }
  }

  onStatus?.('installing-python', '正在自动安装 Python 运行环境...');
  onOutput?.('未检测到可用的 Python 3.10+，开始自动下载并安装...\n');
  let command;
  try {
    command = await installBundledPython(userData, callbacks);
  } catch (err) {
    const wrapped = new Error(err?.message || 'Python 自动安装失败');
    wrapped.code = 'PYTHON_NOT_FOUND';
    throw wrapped;
  }
  const verified = await probeBundledPython(command);
  if (!verified) {
    const err = new Error('Python 自动安装完成，但验证失败。');
    err.code = 'PYTHON_NOT_FOUND';
    throw err;
  }

  await writePythonState(userData, {
    version: PYTHON_VERSION,
    command,
    platform: process.platform,
    arch: process.arch,
    installedAt: new Date().toISOString()
  });
  onStatus?.('python', `Python ${verified.version} 安装完成`);
  onOutput?.(`Python ${verified.version} 已安装到：${bundledPythonDir(userData)}\n`);
  return command;
}

module.exports = {
  PYTHON_VERSION,
  bundledPythonDir,
  bundledPythonExecutables,
  ensureBundledPython,
  installBundledPython
};
