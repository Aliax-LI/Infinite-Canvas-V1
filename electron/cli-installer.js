const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const { expandCliPath } = require('./dependency-setup');
const { NPM_REGISTRY } = require('./mirrors');

const CLI_TOOL_DEFS = [
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    tag: '聊天',
    description: 'OpenAI 官方 CLI，用于 Codex 协议聊天与编程助手。',
    recommended: true
  },
  {
    id: 'gpt-image-2-skill',
    name: 'GPT Image 2 Helper',
    tag: '生图',
    description: 'Codex 生图必备组件；未安装时会出现「未找到 GPT Image 2 helper」。',
    recommended: true
  },
  {
    id: 'jimeng',
    name: '即梦 CLI',
    tag: '可选',
    description: '字节即梦 dreamina CLI，用于即梦协议生图与视频。',
    optional: true
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    tag: '可选',
    description: 'Google Antigravity CLI (agy)，用于 Gemini CLI 协议。',
    optional: true
  }
];

function cliSetupStatePath(userData) {
  return path.join(userData, 'cli-setup-state.json');
}

function needsCliSetup(userData) {
  try {
    const state = JSON.parse(fs.readFileSync(cliSetupStatePath(userData), 'utf8'));
    return !(state.completed || state.skipped);
  } catch (_) {
    return true;
  }
}

async function readCliSetupState(userData) {
  try {
    return JSON.parse(await fsp.readFile(cliSetupStatePath(userData), 'utf8'));
  } catch (_) {
    return null;
  }
}

async function writeCliSetupState(userData, patch) {
  const current = (await readCliSetupState(userData)) || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await fsp.mkdir(userData, { recursive: true });
  await fsp.writeFile(cliSetupStatePath(userData), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function markCliSetupSkipped(userData) {
  return writeCliSetupState(userData, { skipped: true, completed: true });
}

async function markCliSetupCompleted(userData, installed = []) {
  return writeCliSetupState(userData, { completed: true, skipped: false, installed });
}

function cliEnv() {
  return {
    ...process.env,
    PATH: expandCliPath(process.env.PATH),
    NPM_CONFIG_REGISTRY: NPM_REGISTRY
  };
}

function cliBinDirectories() {
  const home = os.homedir();
  const dirs = [
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
        dirs.push(path.join(nvmBase, entry, 'bin'));
      }
    }
  } catch (_) {}
  if (process.platform === 'win32') {
    if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
    if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'npm'));
  }
  return dirs.filter(dir => dir && fs.existsSync(dir));
}

function discoverCliExecutable(...names) {
  const pathValue = expandCliPath(process.env.PATH || '');
  const segments = pathValue.split(path.delimiter).filter(Boolean);
  const suffixes = process.platform === 'win32' ? ['', '.exe', '.cmd'] : [''];
  for (const name of names) {
    if (!name) continue;
    for (const dir of segments) {
      for (const suffix of suffixes) {
        const candidate = path.join(dir, `${name}${suffix}`);
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch (_) {}
      }
    }
  }
  for (const binDir of cliBinDirectories()) {
    for (const name of names) {
      if (!name) continue;
      for (const suffix of suffixes) {
        const candidate = path.join(binDir, `${name}${suffix}`);
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch (_) {}
      }
    }
  }
  return '';
}

function findAntigravityBinary() {
  const found = discoverCliExecutable('agy');
  if (found) return found;
  const searchRoots = ['/Applications', path.join(os.homedir(), 'Applications')];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    if (local) {
      searchRoots.push(path.join(local, 'Microsoft', 'WinGet', 'Packages'));
    }
  }
  const maxDepth = 5;
  function walk(dir, depth) {
    if (depth > maxDepth) return '';
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return '';
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && /^agy(\.exe)?$/i.test(entry.name)) return full;
      if (entry.isDirectory()) {
        const nested = walk(full, depth + 1);
        if (nested) return nested;
      }
    }
    return '';
  }
  for (const root of searchRoots) {
    const match = walk(root, 0);
    if (match) return match;
  }
  return '';
}

function discoverNpmExecutable() {
  return discoverCliExecutable('npm');
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || cliEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: options.shell ?? false,
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
    if (options.timeoutMs) {
      setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
        reject(new Error('命令执行超时'));
      }, options.timeoutMs);
    }
  });
}

async function probeExecutable(exe, versionArgs = ['--version']) {
  if (!exe) return { installed: false, path: '', version: '' };
  try {
    const { stdout, stderr } = await runCommand(exe, versionArgs, { timeoutMs: 15000 });
    const version = `${stdout}${stderr}`.trim();
    return { installed: true, path: exe, version };
  } catch (err) {
    return { installed: false, path: exe, version: '', error: err.message };
  }
}

async function detectToolStatus(toolId) {
  switch (toolId) {
    case 'codex': {
      const exe = discoverCliExecutable('codex');
      const probe = await probeExecutable(exe);
      return {
        id: toolId,
        status: probe.installed ? 'installed' : 'missing',
        path: probe.path,
        version: probe.version,
        detail: probe.installed ? '已安装' : '未安装'
      };
    }
    case 'gpt-image-2-skill': {
      const exe = discoverCliExecutable('gpt-image-2-skill');
      const probe = await probeExecutable(exe);
      return {
        id: toolId,
        status: probe.installed ? 'installed' : 'missing',
        path: probe.path,
        version: probe.version,
        detail: probe.installed ? '已安装' : '未安装'
      };
    }
    case 'jimeng': {
      const exe = discoverCliExecutable('dreamina');
      const probe = await probeExecutable(exe, ['-h']);
      return {
        id: toolId,
        status: probe.installed ? 'installed' : 'missing',
        path: probe.path,
        version: probe.version,
        detail: probe.installed ? '已安装' : '未安装'
      };
    }
    case 'gemini': {
      const exe = findAntigravityBinary() || discoverCliExecutable('gemini');
      const probe = await probeExecutable(exe);
      return {
        id: toolId,
        status: probe.installed ? 'installed' : 'missing',
        path: probe.path,
        version: probe.version,
        detail: probe.installed ? '已安装' : '未安装'
      };
    }
    default:
      return { id: toolId, status: 'missing', detail: '未知工具' };
  }
}

async function detectCliStatus() {
  const tools = [];
  for (const def of CLI_TOOL_DEFS) {
    tools.push({ ...def, ...(await detectToolStatus(def.id)) });
  }
  return tools;
}

async function updateEnvFile(envPath, entries) {
  await fsp.mkdir(path.dirname(envPath), { recursive: true });
  let content = '';
  try {
    content = await fsp.readFile(envPath, 'utf8');
  } catch (_) {}
  const lines = content ? content.split(/\r?\n/) : [];
  const keys = Object.keys(entries);
  const filtered = lines.filter(line => !keys.some(key => line.startsWith(`${key}=`)));
  for (const [key, value] of Object.entries(entries)) {
    filtered.push(`${key}=${value}`);
  }
  await fsp.writeFile(envPath, `${filtered.filter(Boolean).join('\n')}\n`, 'utf8');
}

async function npmInstallGlobal(packageName, onOutput) {
  const npm = discoverNpmExecutable();
  if (!npm) throw new Error('未找到 npm。请先安装 Node.js，或确保 npm 在 PATH 中。');
  onOutput?.(`npm install -g ${packageName}\n`);
  await runCommand(npm, ['install', '-g', packageName], {
    env: cliEnv(),
    onOutput,
    timeoutMs: 300000
  });
}

async function installCodex(onOutput) {
  onOutput?.('正在安装 OpenAI Codex CLI...\n');
  if (process.platform === 'win32') {
    try {
      await runCommand(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://chatgpt.com/codex/install.ps1 | iex'],
        { onOutput, timeoutMs: 300000, shell: false }
      );
    } catch (err) {
      onOutput?.(`独立安装器失败，改用 npm：${err.message}\n`);
      await npmInstallGlobal('@openai/codex', onOutput);
    }
  } else {
    try {
      await runCommand('sh', ['-c', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'], {
        onOutput,
        timeoutMs: 300000
      });
    } catch (err) {
      onOutput?.(`独立安装器失败，改用 npm：${err.message}\n`);
      await npmInstallGlobal('@openai/codex', onOutput);
    }
  }
  const exe = discoverCliExecutable('codex');
  if (!exe) throw new Error('Codex CLI 安装完成，但未在 PATH 中找到 codex。请重启应用后再试。');
  onOutput?.(`Codex CLI 已就绪：${exe}\n`);
}

async function installGptImage2Helper(onOutput) {
  onOutput?.('正在安装 GPT Image 2 Helper...\n');
  await npmInstallGlobal('gpt-image-2-skill', onOutput);
  const exe = discoverCliExecutable('gpt-image-2-skill');
  if (!exe) {
    throw new Error('npm 安装已完成，但未在 PATH 中找到 gpt-image-2-skill。请重启应用后再试。');
  }
  onOutput?.(`GPT Image 2 Helper 已就绪：${exe}\n`);
}

async function installJimeng(appDir, onOutput) {
  onOutput?.('正在安装即梦 dreamina CLI...\n');
  if (process.platform === 'win32') {
    const hasWsl = !!discoverCliExecutable('wsl');
    if (!hasWsl) {
      throw new Error('Windows 上即梦 CLI 需要 WSL。请先安装 WSL/Ubuntu，或使用 macOS/Linux。');
    }
    await runCommand(
      'wsl.exe',
      ['-e', 'sh', '-lc', 'curl -fsSL https://jimeng.jianying.com/cli | bash'],
      { onOutput, timeoutMs: 300000 }
    );
  } else {
    await runCommand('sh', ['-c', 'curl -fsSL https://jimeng.jianying.com/cli | bash'], {
      onOutput,
      timeoutMs: 300000
    });
  }
  const exe = discoverCliExecutable('dreamina');
  if (!exe) throw new Error('即梦 CLI 安装完成，但未找到 dreamina 可执行文件。');
  const envPath = path.join(appDir, 'API', '.env');
  await updateEnvFile(envPath, { JIMENG_USE_WSL: process.platform === 'win32' ? '1' : '0', DREAMINA_BIN: exe });
  onOutput?.(`即梦 CLI 已就绪：${exe}\n`);
}

async function installGemini(appDir, onOutput) {
  onOutput?.('正在安装 Gemini / Antigravity CLI...\n');
  if (process.platform === 'darwin') {
    const brew = discoverCliExecutable('brew');
    if (brew) {
      try {
        await runCommand(brew, ['install', '--cask', 'google-antigravity'], { onOutput, timeoutMs: 600000 });
      } catch (_) {
        await runCommand(brew, ['install', '--cask', 'antigravity'], { onOutput, timeoutMs: 600000 });
      }
    } else {
      throw new Error('未找到 Homebrew。请从 https://antigravity.google 手动安装 Antigravity CLI。');
    }
  } else if (process.platform === 'win32') {
    const winget = discoverCliExecutable('winget');
    if (!winget) {
      throw new Error('未找到 winget。请从 Microsoft Store 安装「应用安装程序」后重试。');
    }
    await runCommand(
      winget,
      [
        'install',
        '--id',
        'Google.AntigravityCLI',
        '-e',
        '--source',
        'winget',
        '--accept-package-agreements',
        '--accept-source-agreements'
      ],
      { onOutput, timeoutMs: 600000 }
    );
  } else {
    throw new Error('当前平台请从 https://antigravity.google 手动安装 Antigravity CLI。');
  }
  const exe = findAntigravityBinary() || discoverCliExecutable('gemini');
  if (!exe) {
    throw new Error('Antigravity CLI 可能已安装，但未在 PATH 中找到 agy。请重启应用后再试。');
  }
  const envPath = path.join(appDir, 'API', '.env');
  await updateEnvFile(envPath, { AGY_BIN: exe, ANTIGRAVITY_BIN: exe });
  onOutput?.(`Gemini CLI 已就绪：${exe}\n`);
}

async function installCliTool(toolId, appDir, onOutput) {
  switch (toolId) {
    case 'codex':
      await installCodex(onOutput);
      break;
    case 'gpt-image-2-skill':
      await installGptImage2Helper(onOutput);
      break;
    case 'jimeng':
      await installJimeng(appDir, onOutput);
      break;
    case 'gemini':
      await installGemini(appDir, onOutput);
      break;
    default:
      throw new Error(`未知 CLI 工具：${toolId}`);
  }
  return detectToolStatus(toolId);
}

module.exports = {
  CLI_TOOL_DEFS,
  needsCliSetup,
  markCliSetupSkipped,
  markCliSetupCompleted,
  detectCliStatus,
  detectToolStatus,
  installCliTool,
  discoverCliExecutable
};
