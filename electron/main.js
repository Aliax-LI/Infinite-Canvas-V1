const { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const {
  ensureDependencies,
  needsDependencySetup,
  getResolvedPython,
  pythonCandidates,
  expandCliPath,
  PYTHON_NOT_FOUND_HINT
} = require('./dependency-setup');
const {
  needsCliSetup,
  markCliSetupSkipped,
  markCliSetupCompleted,
  detectCliStatus,
  installCliTool,
  CLI_TOOL_DEFS
} = require('./cli-installer');

const APP_NAME = '无限画布';
const DEFAULT_PORT = 3000;
const HOST = '127.0.0.1';
const BACKEND_READY_TIMEOUT_MS = 90000;
const IS_TEST = process.env.INFINITE_CANVAS_TEST === '1';

if (IS_TEST && process.env.INFINITE_CANVAS_TEST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.INFINITE_CANVAS_TEST_USER_DATA));
}

let mainWindow = null;
let setupWindow = null;
let backendProcess = null;
let backendPort = DEFAULT_PORT;
let isQuitting = false;
let startupInProgress = false;
let isRestartingBackend = false;
let activePythonCommand = null;
let cliSetupResolver = null;
let cliSetupRejecter = null;
let setupAppDir = null;

function projectRoot() {
  return path.resolve(__dirname, '..');
}

function bundledSourceDir() {
  return path.join(process.resourcesPath, 'app-source');
}

function runtimeSourceDir() {
  return app.isPackaged ? path.join(app.getPath('userData'), 'runtime') : projectRoot();
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

function shouldSkipCopy(relativePath, preserveUserState = false) {
  const normalized = relativePath.split(path.sep).join('/');
  if (
    preserveUserState &&
    (normalized === 'data' ||
      normalized.startsWith('data/') ||
      normalized === 'assets' ||
      normalized.startsWith('assets/') ||
      normalized === 'output' ||
      normalized.startsWith('output/') ||
      normalized === 'API/.env' ||
      normalized === 'global_config.json')
  ) {
    return true;
  }
  return (
    normalized === 'node_modules' ||
    normalized.startsWith('node_modules/') ||
    normalized === 'dist-electron' ||
    normalized.startsWith('dist-electron/') ||
    normalized === '.git' ||
    normalized.startsWith('.git/') ||
    normalized === '.idea' ||
    normalized.startsWith('.idea/') ||
    normalized === 'output' ||
    normalized.startsWith('output/') ||
    normalized === 'assets' ||
    normalized.startsWith('assets/') ||
    normalized === 'data/update_backups' ||
    normalized.startsWith('data/update_backups/')
  );
}

async function copyDirMerge(src, dest, root = src, options = {}) {
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const rel = path.relative(root, srcPath);
    if (shouldSkipCopy(rel, options.preserveUserState)) continue;
    if (entry.isDirectory()) {
      await copyDirMerge(srcPath, destPath, root, options);
    } else if (entry.isFile()) {
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

function readGithubRepoUrl(mainPyPath) {
  const text = readTextIfExists(mainPyPath);
  const match = text.match(/GITHUB_REPO_URL\s*=\s*"([^"]+)"/);
  return match ? match[1] : '';
}

function hasMigratedBackend(appDir) {
  return fs.existsSync(path.join(appDir, 'backend', 'main.py'));
}

async function ensurePackagedRuntime() {
  if (!app.isPackaged) return runtimeSourceDir();
  const bundled = bundledSourceDir();
  const runtime = runtimeSourceDir();
  const bundledVersion = readTextIfExists(path.join(bundled, 'VERSION'));
  const runtimeVersion = readTextIfExists(path.join(runtime, 'VERSION'));
  const bundledBuildId = readTextIfExists(path.join(bundled, 'DESKTOP_BUILD_ID'));
  const runtimeBuildId = readTextIfExists(path.join(runtime, 'DESKTOP_BUILD_ID'));
  const runtimeMain = path.join(runtime, 'main.py');
  const runtimeBackendMain = path.join(runtime, 'backend', 'main.py');
  const bundledMain = path.join(bundled, 'main.py');
  const firstInstall = !fs.existsSync(runtimeMain) && !fs.existsSync(runtimeBackendMain);
  const bundledRepo = readGithubRepoUrl(bundledMain);
  const runtimeRepo = readGithubRepoUrl(runtimeMain);
  const repoChanged = !!(bundledRepo && runtimeRepo && bundledRepo !== runtimeRepo);
  const buildChanged = !!(bundledBuildId && bundledBuildId !== runtimeBuildId);
  if (firstInstall || (bundledVersion && bundledVersion !== runtimeVersion) || buildChanged || repoChanged) {
    await copyDirMerge(bundled, runtime, bundled, { preserveUserState: !firstInstall });
  }
  await fsp.mkdir(path.join(runtime, 'data'), { recursive: true });
  await fsp.mkdir(path.join(runtime, 'assets'), { recursive: true });
  await fsp.mkdir(path.join(runtime, 'output'), { recursive: true });
  return runtime;
}

function staticRootDir() {
  if (app.isPackaged) {
    const runtime = runtimeSourceDir();
    if (fs.existsSync(path.join(runtime, 'static'))) return runtime;
    return bundledSourceDir();
  }
  return projectRoot();
}

function assetFilePath(...segments) {
  const filePath = path.join(staticRootDir(), 'static', ...segments);
  return fs.existsSync(filePath) ? filePath : '';
}

function assetFileUrl(...segments) {
  const filePath = assetFilePath(...segments);
  return filePath ? pathToFileURL(filePath).href : '';
}

function windowIconPath() {
  const candidates = [
    path.join(projectRoot(), 'frontend', 'public', 'images', 'logo.png'),
    assetFilePath('images', 'logo.png'),
    path.join(projectRoot(), 'build', 'icon.png'),
    path.join(projectRoot(), 'build', 'icon.icns')
  ];
  if (app.isPackaged) {
    candidates.unshift(
      path.join(process.resourcesPath, 'app-source', 'frontend', 'public', 'images', 'logo.png'),
      path.join(process.resourcesPath, 'app-source', 'static', 'images', 'logo.png')
    );
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return path.join(projectRoot(), 'build', 'icon.png');
}

function sendSetupStatus(status, detail) {
  setupWindow?.webContents.send('setup:status', { status, detail });
}

function sendSetupProgress(text) {
  setupWindow?.webContents.send('setup:progress', text);
}

function sendSetupPhase(phase) {
  setupWindow?.webContents.send('setup:phase', { phase });
}

function sendCliStatus(payload) {
  setupWindow?.webContents.send('setup:cli-status', payload);
}

function sendCliLog(text) {
  setupWindow?.webContents.send('setup:cli-log', text);
}

function setupWindowBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? '#0f141d' : '#f7f7f8';
}

function createSetupWindow() {
  return new Promise(resolve => {
    const dark = nativeTheme.shouldUseDarkColors;
    setupWindow = new BrowserWindow({
      width: 780,
      height: 620,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: `${APP_NAME} - 初始化`,
      icon: windowIconPath(),
      backgroundColor: setupWindowBackgroundColor(),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'setup-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    setupWindow.on('closed', () => {
      setupWindow = null;
      if (startupInProgress && !mainWindow) {
        startupInProgress = false;
        if (cliSetupRejecter) {
          cliSetupRejecter(new Error('用户关闭了初始化窗口'));
          cliSetupRejecter = null;
          cliSetupResolver = null;
        }
        isQuitting = true;
        app.quit();
      }
    });
    setupWindow.webContents.once('did-finish-load', () => {
      setupWindow.show();
      resolve(setupWindow);
    });
    setupWindow.loadFile(path.join(__dirname, 'setup.html'), {
      query: { theme: dark ? 'dark' : 'light' }
    });
  });
}

function closeSetupWindow() {
  if (!setupWindow) return;
  const win = setupWindow;
  setupWindow = null;
  win.close();
}

async function promptDependencyInstallFailed(errorMessage) {
  const result = await dialog.showMessageBox({
    type: 'error',
    title: `${APP_NAME} 初始化失败`,
    message: 'Python 依赖安装未成功',
    detail:
      `${errorMessage || '未知错误'}\n\n` +
      '请检查网络连接后重试。应用会从国内镜像自动安装依赖。',
    buttons: ['重试', '退出'],
    defaultId: 0,
    cancelId: 1
  });
  return result.response === 0 ? 'retry' : 'quit';
}

async function promptPythonInstallFailed(errorMessage) {
  const result = await dialog.showMessageBox({
    type: 'error',
    title: `${APP_NAME} 初始化失败`,
    message: 'Python 自动安装未成功',
    detail:
      `${errorMessage || '未知错误'}\n\n` +
      `${PYTHON_NOT_FOUND_HINT}\n` +
      '可点击「重试」再次尝试自动安装，或在网络受限时打开官方下载页手动安装后重新打开应用。',
    buttons: ['重试', '打开 Python 下载页', '退出'],
    defaultId: 0,
    cancelId: 2
  });
  if (result.response === 0) return 'retry';
  if (result.response === 1) {
    await shell.openExternal('https://www.python.org/downloads/');
  }
  return 'quit';
}

function backendPythonCandidates() {
  const candidates = [];
  const userData = app.getPath('userData');
  if (activePythonCommand) candidates.push(activePythonCommand);
  const resolved = getResolvedPython();
  if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
  for (const candidate of pythonCandidates(userData)) {
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  return candidates;
}

function trySpawnPython(command, appDir, port) {
  const env = {
    ...process.env,
    HOST,
    PORT: String(port),
    INFINITE_CANVAS_ELECTRON: '1',
    PYTHONUNBUFFERED: '1',
    PATH: expandCliPath(process.env.PATH)
  };
  const migratedArgs = ['-m', 'uvicorn', 'backend.main:app', '--host', HOST, '--port', String(port)];
  const legacyArgs = ['main.py'];
  const args = command === 'py'
    ? ['-3', ...(hasMigratedBackend(appDir) ? migratedArgs : legacyArgs)]
    : (hasMigratedBackend(appDir) ? migratedArgs : legacyArgs);
  const child = spawn(command, args, {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  return child;
}

function getAppUrl(port) {
  const useVite = !app.isPackaged && process.env.USE_VITE === '1';
  if (useVite) return 'http://127.0.0.1:5173';
  return `http://${HOST}:${port}/`;
}

function isAllowedAppNavigation(url, port) {
  const appUrl = getAppUrl(port);
  return url.startsWith(appUrl) || url.startsWith(`http://${HOST}:${port}/`);
}

function attachBackendLogging(child) {
  child.stdout?.on('data', chunk => process.stdout.write(`[backend] ${chunk}`));
  child.stderr?.on('data', chunk => process.stderr.write(`[backend] ${chunk}`));
}

async function startBackend(appDir, port) {
  let lastError = null;
  for (const candidate of backendPythonCandidates()) {
    try {
      const child = trySpawnPython(candidate, appDir, port);
      const failed = await new Promise(resolve => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(null);
        }, 1200);
        child.once('error', err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(err);
        });
        child.once('exit', code => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(new Error(`${candidate} exited early with code ${code}`));
        });
      });
      if (failed) {
        lastError = failed;
        continue;
      }
      backendProcess = child;
      attachBackendLogging(child);
      child.once('exit', () => {
        backendProcess = null;
        if (!isQuitting) {
          isRestartingBackend = true;
          setTimeout(async () => {
            try {
              await startBackend(appDir, port);
              await waitForBackend(port);
              isRestartingBackend = false;
              mainWindow?.loadURL(getAppUrl(port));
            } catch (err) {
              isRestartingBackend = false;
              showBackendError(err);
            }
          }, 1000);
        }
      });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('无法启动 Python 后端。');
}

function waitForPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function pickBackendPort() {
  if (await waitForPortFree(DEFAULT_PORT)) return DEFAULT_PORT;
  for (let port = 33100; port < 33200; port += 1) {
    if (await waitForPortFree(port)) return port;
  }
  throw new Error('未找到可用的本地端口。');
}

function probeBackend(port) {
  return new Promise(resolve => {
    const req = http.get(`http://${HOST}:${port}/api/app-info`, res => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(port) {
  const started = Date.now();
  while (Date.now() - started < BACKEND_READY_TIMEOUT_MS) {
    if (await probeBackend(port)) return;
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  throw new Error(`后端在端口 ${port} 上未能就绪。`);
}

function showBackendError(error) {
  dialog.showErrorBox(
    `${APP_NAME} 启动失败`,
    `${error?.message || error}\n\n如问题持续，请检查网络连接后重试。应用会自动创建隔离 Python 环境并从国内镜像安装依赖。`
  );
}

function waitForCliSetup() {
  return new Promise((resolve, reject) => {
    cliSetupResolver = resolve;
    cliSetupRejecter = reject;
  });
}

function resolveCliSetup() {
  if (cliSetupResolver) {
    cliSetupResolver();
    cliSetupResolver = null;
    cliSetupRejecter = null;
  }
}

async function runStartup() {
  startupInProgress = true;
  const appDir = await ensurePackagedRuntime();
  setupAppDir = appDir;
  const userData = app.getPath('userData');
  const isDev = !app.isPackaged;
  const needDeps = IS_TEST ? false : await needsDependencySetup(appDir, userData, { isDev });
  const needCli = IS_TEST ? false : needsCliSetup(userData);

  if (needDeps || needCli) {
    await createSetupWindow();
    if (!needDeps) {
      sendSetupStatus('ready', 'Python 依赖已就绪');
    }
  }

  activePythonCommand = IS_TEST
    ? (process.env.INFINITE_CANVAS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'))
    : await ensureDependencies(appDir, userData, {
        isDev,
        onStatus: sendSetupStatus,
        onOutput: sendSetupProgress
      });

  if (needCli && setupWindow) {
    sendSetupPhase('cli');
    await waitForCliSetup();
  }

  sendSetupPhase('launching');
  sendSetupStatus('launching', '依赖已就绪，正在启动后端...');
  backendPort = await pickBackendPort();
  await startBackend(appDir, backendPort);
  sendSetupStatus('launching', '正在等待后端就绪...');
  await waitForBackend(backendPort);
  sendSetupStatus('ready', '初始化完成，正在打开主界面…');
  await new Promise(resolve => setTimeout(resolve, 500));
  createWindow(backendPort);
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: APP_NAME,
    icon: windowIconPath(),
    backgroundColor: '#f7f7f8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    closeSetupWindow();
    mainWindow.show();
    startupInProgress = false;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppNavigation(url, port)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', event => {
    const url = event.url || '';
    if (isAllowedAppNavigation(url, port)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  mainWindow.loadURL(getAppUrl(port));
}

function stopBackend() {
  if (!backendProcess) return;
  const child = backendProcess;
  backendProcess = null;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch (_) {}
      }, 3000);
    }
  } catch (_) {}
}

ipcMain.handle('setup:getLogoUrl', () => {
  const logoPath = assetFilePath('images', 'logo.png') || windowIconPath();
  if (!logoPath || !fs.existsSync(logoPath)) return '';
  return pathToFileURL(logoPath).href;
});

ipcMain.handle('setup:getTheme', () => ({
  theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
  dark: nativeTheme.shouldUseDarkColors
}));

ipcMain.handle('setup:getFontUrls', () => ({
  spaceGrotesk500: assetFileUrl('vendor', 'fonts', 'space-grotesk-10.ttf'),
  spaceGrotesk700: assetFileUrl('vendor', 'fonts', 'space-grotesk-8.ttf'),
  jetbrainsMono: assetFileUrl('vendor', 'fonts', 'jetbrains-mono-7.ttf')
}));

ipcMain.handle('setup:getCliTools', async () => {
  const tools = await detectCliStatus();
  return tools.map(tool => {
    const def = CLI_TOOL_DEFS.find(item => item.id === tool.id) || {};
    return { ...def, ...tool };
  });
});

ipcMain.handle('setup:installCli', async (_event, toolId) => {
  const appDir = setupAppDir || (await ensurePackagedRuntime());
  sendCliStatus({ id: toolId, status: 'installing', detail: '安装中' });
  try {
    const result = await installCliTool(toolId, appDir, sendCliLog);
    sendCliStatus({
      id: toolId,
      status: result.status,
      detail: result.detail,
      path: result.path
    });
    return result;
  } catch (err) {
    sendCliStatus({ id: toolId, status: 'failed', detail: err?.message || '安装失败' });
    throw err;
  }
});

ipcMain.handle('setup:skipCli', async () => {
  await markCliSetupSkipped(app.getPath('userData'));
  resolveCliSetup();
  return { ok: true };
});

ipcMain.handle('setup:finishSetup', async () => {
  const tools = await detectCliStatus();
  const installed = tools.filter(tool => tool.status === 'installed').map(tool => tool.id);
  await markCliSetupCompleted(app.getPath('userData'), installed);
  resolveCliSetup();
  return { ok: true, installed };
});

ipcMain.handle('desktop:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择共享文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return '';
  return result.filePaths[0];
});

ipcMain.handle('desktop:backend-status', async () => ({
  port: backendPort,
  restarting: isRestartingBackend,
  running: !!backendProcess
}));

ipcMain.handle('desktop:open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  while (true) {
    try {
      await runStartup();
      break;
    } catch (err) {
      startupInProgress = false;
      resolveCliSetup();
      closeSetupWindow();
      if (isQuitting || /用户关闭了初始化窗口/.test(err?.message || '')) {
        break;
      }
      const autoInstallFailed =
        err?.code === 'PYTHON_NOT_FOUND' ||
        /自动安装|下载失败|Python 安装|未检测到可用的 Python/i.test(err?.message || '');
      const dependencyInstallFailed =
        /依赖安装|pip|venv|虚拟环境|验证失败/i.test(err?.message || '');
      if (autoInstallFailed) {
        const action = await promptPythonInstallFailed(err?.message);
        if (action === 'retry') continue;
      } else if (dependencyInstallFailed) {
        const action = await promptDependencyInstallFailed(err?.message);
        if (action === 'retry') continue;
      } else {
        showBackendError(err);
      }
      app.quit();
      break;
    }
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (startupInProgress) return;
  app.quit();
});
