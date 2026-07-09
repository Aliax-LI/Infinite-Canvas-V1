# Infinite Canvas 改造方案

> **文档版本**: v1.0  
> **日期**: 2026-07-09  
> **状态**: Phase 0 脚手架已建立，后续功能迁移交由 Cursor 执行  
> **当前目标**: 完成 **Python + Electron + React + TypeScript** 桌面应用脚手架，并将旧源码、旧脚本、旧文档归档到 `history/`

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [现状分析](#2-现状分析)
3. [目标架构](#3-目标架构)
4. [技术选型](#4-技术选型)
5. [目录结构](#5-目录结构)
6. [后端改造方案](#6-后端改造方案)
7. [前端改造方案](#7-前端改造方案)
8. [Electron 桌面壳改造](#8-electron-桌面壳改造)
9. [更新机制（Electron 专用）](#9-更新机制electron-专用)
10. [测试策略](#10-测试策略)
11. [CI/CD 与发布](#11-cicd-与发布)
12. [实施阶段与里程碑](#12-实施阶段与里程碑)
13. [风险与缓解](#13-风险与缓解)
14. [待评审开放问题](#14-待评审开放问题)
15. [决策记录](#15-决策记录)

---

## 1. 背景与目标

### 1.1 背景

Infinite Canvas 原始实现为 **Python FastAPI 单体后端 + Vanilla HTML/JS 前端 + Electron 桌面壳** 架构。旧后端 `main.py` 约 17,000 行（153 个 API 端点），旧前端 `static/` 约 48,000 行 JavaScript（15 个 HTML 页面）。这些 legacy 源码已归档到 `history/main.py` 与 `history/static/`；旧说明文档与手动安装/启动脚本已归档到 `history/docs/` 与 `history/scripts/`。当前根目录只保留新脚手架与必要运行资源。

### 1.2 改造目标

| 维度 | 目标 |
|------|------|
| **产品形态** | **仅 Electron 桌面应用**（不再面向 Web 浏览器独立部署） |
| **后端** | Python FastAPI，模块化拆分为 `backend/` 包 |
| **前端** | React 19 + TypeScript 5 + Vite 6 SPA |
| **桌面壳** | 保留并增强 Electron 43.1.0（跟随 npm 最新稳定版） |
| **迁移策略** | Big Bang 一次性重写（非渐进 Strangler） |
| **迁移优先级** | Canvas First（smart-canvas → canvas 优先） |
| **当前交付边界** | 仅完成脚手架、门禁、旧源码/旧脚本/旧文档归档；业务功能迁移后续由 Cursor 执行 |

### 1.3 非目标（明确不做）

- 保留 Web 端独立部署能力
- 保留应用内热更新（一键更新 main.py / static）
- 保留 ModelScope 双源下载更新
- 引入 electron-updater 自动下载安装包（无代码签名，体验差）
- 引入 `@xyflow/react` 等第三方画布框架（自研迁移）

---

## 2. 现状分析

### 2.1 代码规模

| 模块 | 路径 | 规模 | 说明 |
|------|------|------|------|
| 后端单体 | `history/main.py` | 17,053 行 / 796 函数 / 72 类 | legacy FastAPI，153 个 HTTP/WebSocket 端点 |
| 智能画布 | `history/static/js/smart-canvas.js` | 16,926 行 | 节点图、WebSocket、innerHTML 重度 DOM |
| 传统画布 | `history/static/js/canvas.js` | 14,794 行 | 101 处 API 调用 |
| 素材管理 | `history/static/js/asset-manager.js` | 4,412 行 | CRUD + 分类 |
| API 配置 | `history/static/js/api-settings.js` | 3,796 行 | 多 Provider 配置 |
| 时间线 | `history/static/js/ltx-director-timeline.js` | 4,111 行 | LTX Director |
| 其余页面 | 9 个 HTML + JS | ~5,000 行 | 中低复杂度 |
| Electron | `electron/` | ~1,500 行 | 首启依赖安装、CLI 引导、打包 |
| 测试 | — | **0** | 无 pytest / vitest / playwright |

### 2.2 现有架构

```
用户 → Electron main.js → spawn uvicorn backend.main:app (:3000)
                              ↓
                         FastAPI 服务
                              ↓
                    StaticFiles 挂载 frontend/dist（生产）
                              ↓
                    BrowserWindow 加载 localhost:3000
```

### 2.3 现有能力（需保留）

- Electron 自动检测/安装 Python 3.10+
- 清华 PyPI 镜像首启依赖安装
- CLI 工具引导（Codex、Gemini、即梦）
- GitHub Actions 双平台打包（`.dmg` / `.exe`）
- `DESKTOP_BUILD_ID` + `VERSION` 运行时同步机制
- Chrome 采集插件 / PS 插件（`tools/` 目录，独立维护）
- 用户数据目录（`data/`、`assets/`、`output/`）路径不变

---

## 3. 目标架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主进程                         │
│  main.js │ preload.js │ dependency-setup │ cli-installer │
│  ensurePackagedRuntime() │ IPC handlers                  │
└────────────┬──────────────────────────┬───────────────────┘
             │ spawn                    │ loadURL
             ▼                          ▼
┌────────────────────────┐   ┌─────────────────────────────┐
│  Python 本地后端        │   │  渲染进程 — React SPA        │
│  backend/main.py       │◄──│  frontend/dist (prod)        │
│  uvicorn 127.0.0.1     │   │  localhost:5173 (dev)        │
│  routers/ services/    │   │  features/ shared/ i18n/     │
└────────────────────────┘   └─────────────────────────────┘
             │
             ▼
┌────────────────────────┐
│  本地数据（路径不变）    │
│  data/ assets/ output/ │
│  workflows/            │
└────────────────────────┘
```

### 3.2 关键约束

| 约束 | 说明 |
|------|------|
| 绑定地址 | 后端仅监听 `127.0.0.1`，不对外网暴露 |
| CORS | 收紧为 `http://127.0.0.1:*` 和 `http://localhost:*` |
| 用户数据 | `data/`、`assets/`、`output/` 路径与格式保持不变 |
| API 契约 | URL 路径保持不变，避免 Chrome/PS 插件断裂 |
| 打包 | `electron-builder` 继续产出 `.dmg` / `.exe` |

### 3.3 开发模式

```bash
npm run dev
# 等价于并行启动：
#   1. frontend: vite dev server 127.0.0.1:5173
#   2. electron:  USE_VITE=1 electron .  → 加载 127.0.0.1:5173
#   3. backend:   由 Electron 主进程启动，并在 3000 被占用时自动选择 33100-33199
```

### 3.4 生产模式

```bash
npm run build:desktop
#   1. vite build → frontend/dist/
#   2. electron-builder → dist-electron/
# FastAPI 托管 frontend/dist：
#   app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="spa")
```

---

## 4. 技术选型

### 4.1 前端

| 类别 | 选型 | 版本 |
|------|------|------|
| 框架 | React | 19 |
| 语言 | TypeScript | 5 |
| 构建 | Vite | 6 |
| 样式 | Tailwind CSS | 4 |
| 路由 | React Router | 7 |
| 状态管理 | Zustand + Immer | latest |
| 数据请求 | TanStack Query | v5 |
| 国际化 | i18next | latest |
| 3D（全景） | @react-three/fiber | latest |
| 单元测试 | Vitest + React Testing Library | latest |
| 组件测试 | @testing-library/react | latest |

### 4.2 后端

| 类别 | 选型 | 版本 |
|------|------|------|
| 框架 | FastAPI | latest |
| 运行时 | Python | 3.11 |
| 项目配置 | pyproject.toml | — |
| Lint | ruff | latest |
| 测试 | pytest + pytest-asyncio | latest |
| HTTP 测试客户端 | httpx AsyncClient | latest |
| 安全审计 | bandit | latest |

### 4.3 桌面

| 类别 | 选型 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 43.1.0 |
| 打包 | electron-builder | 26 |
| E2E 测试 | Playwright `_electron.launch` | latest |
| 测试辅助 | 自定义 IPC TestDriver | — |

### 4.4 工具链

| 类别 | 选型 |
|------|------|
| 包管理 | npm workspaces（根 + frontend） |
| Node 版本 | 22（`.nvmrc`） |
| Python 版本 | 3.11（`.python-version`） |
| Git 分支 | `dev`（长期集成） |
| 提交规范 | Conventional Commits，简体中文 |

---

## 5. 目录结构

```
Infinite-Canvas-V1/
│
├── backend/                          # Python 后端
│   ├── __init__.py
│   ├── main.py                       # 入口：uvicorn backend.main:app
│   ├── app.py                        # FastAPI 实例工厂
│   ├── config.py                     # 路径常量、环境变量
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── system.py                 # app-info, check-update
│   │   ├── canvases.py               # 画布 CRUD、协作、回收站
│   │   ├── media.py                  # 上传、预览、下载
│   │   ├── assets.py                 # 本地素材库
│   │   ├── comfyui.py                # ComfyUI 代理
│   │   ├── runninghub.py             # RunningHub 工作流
│   │   ├── ai_providers.py           # OpenAI/Gemini/火山/Modelscope
│   │   ├── cli_tools.py              # Codex/Gemini/即梦 CLI
│   │   └── websocket.py              # /ws/stats
│   ├── services/                     # 业务逻辑层
│   ├── models/                       # Pydantic schemas
│   └── tests/
│       ├── conftest.py
│       ├── unit/
│       └── integration/
│
├── frontend/                         # React SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── app/
│       │   ├── router.tsx
│       │   └── ShellLayout.tsx       # 侧栏导航 + 更新红点
│       ├── features/
│       │   ├── update/               # 更新检测 UI
│       │   ├── smart-canvas/         # Phase 2 优先
│       │   ├── canvas/
│       │   ├── canvas-list/
│       │   ├── asset-manager/
│       │   ├── api-settings/
│       │   ├── settings/
│       │   ├── comfyui-settings/
│       │   ├── gpt-chat/
│       │   ├── tools/
│       │   └── ...                   # angle, enhance, klein, online, zimage
│       ├── shared/
│       │   ├── api/                  # TanStack Query client
│       │   ├── hooks/
│       │   ├── components/
│       │   ├── i18n/
│       │   └── utils/
│       └── types/                    # OpenAPI 生成的 TS 类型
│
├── electron/                         # 桌面壳
│   ├── main.js
│   ├── preload.js
│   ├── setup.html / setup-preload.js
│   ├── dependency-setup.js
│   ├── cli-installer.js
│   ├── python-installer.js
│   ├── mirrors.js
│   └── test-hooks.js                 # INFINITE_CANVAS_TEST IPC
│
├── tests/                            # 跨层 E2E
│   ├── e2e/
│   │   ├── electron/
│   │   └── fixtures/
│   └── helpers/
│       └── test-driver.ts
│
├── history/                          # legacy 归档，供 Cursor 后续迁移参考
│   ├── main.py
│   ├── docs/
│   ├── static/
│   └── scripts/
├── data/                             # 用户数据（路径不变）
├── assets/                           # 运行时生成（gitignore）
├── output/                           # 运行时生成（gitignore）
├── workflows/                        # ComfyUI 工作流 JSON
├── CLI/                              # CLI 安装脚本
├── tools/                            # Chrome/PS 插件（独立）
├── scripts/
│   ├── write-desktop-build-id.js
│   └── generate-openapi-types.ts
├── build/                            # Electron 图标
├── docs/
│   └── MIGRATION_PLAN.md             # 本文档
├── .github/workflows/
│   ├── release-desktop.yml
│   └── test-desktop.yml              # 新增
│
├── package.json                      # 根 workspace
├── pyproject.toml
├── playwright.config.ts
├── .nvmrc                            # 22
├── .python-version                   # 3.11
├── requirements.txt                  # 从 pyproject 导出，供 pip 首启安装
└── VERSION
```

### 5.1 Legacy 归档项

| 路径 | 时机 |
|------|------|
| `history/main.py` | 已归档，后续仅作为迁移参考 |
| `history/static/` | 已归档，后续由 Cursor 按功能迁移到 React |
| `history/docs/` | 已归档旧 README、桌面说明、运行说明、使用教程等 |
| `history/scripts/` | 已归档旧 `run.bat`、`mac-启动服务.sh`、安装依赖脚本、即梦 CLI 辅助脚本等 |

### 5.2 不迁移项

| 路径 | 原因 |
|------|------|
| `tools/chrome-local-asset-importer/` | Chrome 扩展，独立发布 |
| `tools/photoshop-asset-connector/` | PS 插件，独立运行 |
| `CLI/` | 命令行工具安装包 |

---

## 6. 后端改造方案

### 6.1 入口变更

**所有引用 `main.py` 的位置同步修改：**

| 文件 | 现值 | 新值 |
|------|------|------|
| `electron/main.js` | `spawn(python, ['main.py'])` | `spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', HOST, '--port', PORT])` |
| `package.json` extraResources | `"main.py"` / `"static/**"` | `"backend/**"`, `"frontend/dist/**"`, `"pyproject.toml"` |
| `run.bat` | `main.py` | `python -m uvicorn backend.main:app` |
| `mac-启动服务.sh` | `python3 main.py` | `python3 -m uvicorn backend.main:app` |

### 6.2 路径常量

`backend/config.py` 中 `BASE_DIR` 指向项目根目录（`Path(__file__).resolve().parent.parent`），确保 `DATA_DIR`、`ASSETS_DIR` 等仍指向根目录下的 `data/`、`assets/`。

### 6.3 Router 拆分计划

| Router 模块 | 预估端点数 | 来源 |
|-------------|-----------|------|
| `system` | ~5 | app-info, check-update |
| `canvases` | ~25 | 画布 CRUD、协作、回收站 |
| `media` | ~15 | 上传、预览、下载 |
| `assets` | ~20 | 本地素材库 |
| `comfyui` | ~15 | ComfyUI 代理 |
| `runninghub` | ~20 | RH 工作流 |
| `ai_providers` | ~30 | 多 Provider |
| `cli_tools` | ~15 | CLI 工具 |
| `websocket` | 1 | /ws/stats |

拆分原则：
- URL 路径零变更
- 每个 router 文件 < 500 行
- 业务逻辑下沉到 `services/`
- 拆分过程中同步补 pytest 集成测试

### 6.4 pyproject.toml

```toml
[project]
name = "infinite-canvas-backend"
version = "2026.07.6"
requires-python = ">=3.11"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "requests",
  "pydantic>=2",
  "python-multipart",
  "httpx",
  "pillow",
]

[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio", "httpx", "bandit", "ruff"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["backend/tests"]

[tool.ruff]
line-length = 120
target-version = "py311"
```

`requirements.txt` 从 pyproject 导出，供 Electron 首启 `pip install -r requirements.txt` 继续使用。

### 6.5 CORS 收紧

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 6.6 静态资源托管

生产模式下 FastAPI 托管 React 构建产物：

```python
# backend/app.py
if os.path.isdir(FRONTEND_DIST_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="spa")
```

开发模式下由 Vite dev server 提供前端，FastAPI 仅提供 API。

---

## 7. 前端改造方案

### 7.1 页面映射

| 现有 HTML | React 路由 | 优先级 |
|-----------|-----------|--------|
| `smart-canvas.html` | `/canvas/:id` | **P0 — Phase 2** |
| `canvas.html` | `/legacy-canvas/:id` | **P0 — Phase 2** |
| `index.html` (Shell) | `/` + `ShellLayout` | P1 — Phase 2 |
| `canvas-list.html` | `/canvases` | P1 |
| `settings.html` | `/settings` | P1 |
| `api-settings.html` | `/settings/api` | P2 — Phase 3 |
| `asset-manager.html` | `/assets` | P2 |
| `comfyui-settings.html` | `/settings/workflows` | P2 |
| `gpt-chat.html` | `/chat` | P2 |
| `tools.html` | `/tools` | P3 |
| `enhance.html` | `/enhance` | P3 |
| `klein.html` | `/klein` | P3 |
| `zimage.html` | `/zimage` | P3 |
| `angle.html` | `/angle` | P3 |
| `online.html` | `/online` | P3 |

### 7.2 smart-canvas.js 拆分路径

```
smart-canvas.js (16,926 行)
  → frontend/src/features/smart-canvas/
      ├── core/
      │   ├── state.ts          # nodes, edges, selection, dragState
      │   ├── layout.ts         # 自动排列、minimap 计算
      │   ├── websocket.ts      # WS 连接 + 事件分发
      │   └── generation.ts     # 引擎选择、参数、运行逻辑
      ├── hooks/
      │   ├── useCanvas.ts
      │   ├── useWebSocket.ts
      │   └── useGeneration.ts
      ├── components/
      │   ├── CanvasWorld.tsx   # 主画布渲染
      │   ├── Composer.tsx      # 底部输入区
      │   ├── NodeCard.tsx      # 单节点组件
      │   ├── AssetPanel.tsx    # 素材侧栏
      │   └── Minimap.tsx
      └── SmartCanvasPage.tsx
```

关键迁移决策：
- `innerHTML` 模板字符串 → React 组件树
- 拖拽/缩放保留命令式 transform（`useRef` + `requestAnimationFrame`）
- 视口外节点不 mount（虚拟化）
- `React.memo` + 稳定节点 ID

### 7.3 状态管理

| 场景 | 方案 |
|------|------|
| 服务端数据（API 响应） | TanStack Query（缓存、重试、乐观更新） |
| 画布节点图状态 | Zustand + Immer（可变状态友好） |
| UI 局部状态 | `useState` / `useReducer` |
| 主题 / 语言 | Zustand persist + i18next |

### 7.4 i18n 迁移

现有 `static/js/i18n/*.js` 中的 key-value 结构迁移为 i18next 资源文件：

```
frontend/src/shared/i18n/
├── index.ts              # i18next 初始化
├── locales/
│   ├── zh/
│   │   ├── common.json
│   │   ├── canvas.json
│   │   ├── settings.json
│   │   └── ...
│   └── en/
│       └── ...
```

### 7.5 API 类型生成

从 FastAPI 自动导出 OpenAPI schema，生成 TypeScript 类型：

```bash
# scripts/generate-openapi-types.ts
# 运行后端 → GET /openapi.json → openapi-typescript → frontend/src/types/api.d.ts
```

---

## 8. Electron 桌面壳改造

### 8.1 加载策略

```javascript
// electron/main.js
const isDev = !app.isPackaged;
const useVite = isDev && process.env.USE_VITE === '1';

function getAppUrl(port) {
  if (useVite) return 'http://127.0.0.1:5173';
  return `http://${HOST}:${port}/`;
}
```

### 8.2 后端启动变更

```javascript
// 现值
const args = command === 'py' ? ['-3', 'main.py'] : ['main.py'];

// 新值
const args = command === 'py'
  ? ['-3', '-m', 'uvicorn', 'backend.main:app', '--host', HOST, '--port', String(port)]
  : ['-m', 'uvicorn', 'backend.main:app', '--host', HOST, '--port', String(port)];
```

### 8.3 preload 扩展

```javascript
// electron/preload.js — 新增
contextBridge.exposeInMainWorld('infiniteCanvasDesktop', {
  isElectron: true,
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  backendStatus: () => ipcRenderer.invoke('desktop:backend-status'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),  // 新增
  getPathForFile: file => { /* 现有 */ },
});
```

```javascript
// electron/main.js — 新增 IPC handler
ipcMain.handle('desktop:open-external', async (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});
```

### 8.4 运行时同步（保留不变）

`ensurePackagedRuntime()` 逻辑保持不变：
- 比较 bundled vs runtime 的 `VERSION` 和 `DESKTOP_BUILD_ID`
- 变化时从 `app-source` 复制到 `userData/runtime/`
- 保留用户数据（`data/`、`assets/`、`output/`）

### 8.5 打包配置变更

`package.json` → `build.extraResources.filter` 更新：

```json
{
  "filter": [
    "backend/**",
    "frontend/dist/**",
    "pyproject.toml",
    "requirements.txt",
    "VERSION",
    "DESKTOP_BUILD_ID",
    "workflows/**",
    "data/**",
    "CLI/**",
    "tools/**",
    "!node_modules/**",
    "!dist-electron/**",
    "!static/**"
  ]
}
```

---

## 9. 更新机制（Electron 专用）

### 9.1 设计原则

- **仅 Electron 桌面应用**，不保留 Web 端更新机制
- **仅检测 + 提示 + 跳转 GitHub Releases**，不自动下载安装
- **完全移除热更新**（一键更新 main.py / static）
- **不使用 electron-updater**（无代码签名，体验差）

### 9.2 更新流程

```
应用启动
  → GET /api/check-update
  → 拉取 GitHub Releases latest tag / VERSION
  → 比较版本号
  → 有新版本：侧栏 GitHub 按钮显示红点
  → 用户点击 → UpdateModal 展示 changelog
  → 点击「前往下载」→ shell.openExternal(release_url)
  → 用户手动安装新 .dmg/.exe
  → ensurePackagedRuntime() 检测 VERSION/DESKTOP_BUILD_ID 变化
  → 自动同步 runtime
```

### 9.3 保留的 API

#### `GET /api/app-info`

```json
{
  "version": "2026.07.6",
  "desktop_build_id": "abc123",
  "is_electron": true,
  "repo_url": "https://github.com/Aliax-LI/Infinite-Canvas-V1",
  "release_url": "https://github.com/Aliax-LI/Infinite-Canvas-V1/releases"
}
```

#### `GET /api/check-update`

```json
{
  "current": "2026.07.6",
  "latest": {
    "version": "2026.07.8",
    "release_url": "https://github.com/Aliax-LI/Infinite-Canvas-V1/releases/tag/v2026.07.8",
    "release_notes": "- 新增 xxx\n- 修复 yyy"
  },
  "update_available": true,
  "desktop_build_id": "abc123"
}
```

检测逻辑：
1. 读取本地 `VERSION` 文件
2. 请求 `https://api.github.com/repos/Aliax-LI/Infinite-Canvas-V1/releases/latest`
3. 提取 `tag_name`（去 `v` 前缀）与 `body`（changelog）
4. 版本比较 → 返回结果
5. **不写文件、不下载、不重启**

### 9.4 删除的 API 与逻辑

| 删除项 | 原路径 | 原因 |
|--------|--------|------|
| `POST /api/update-from-github` | main.py | 热更新废弃 |
| `POST /api/update-rollback` | main.py | 无热更新即无回滚 |
| `GET /api/update-backups` | main.py | 备份机制废弃 |
| `GET /api/update-connectivity` | main.py | Web 双源探测废弃 |
| `GET /api/update-connectivity/probe` | main.py | 同上 |
| `update_allowed_file()` | main.py | 不再下载覆盖文件 |
| `download_github_update_files()` | main.py | 同上 |
| `download_modelscope_update_files()` | main.py | 移除 ModelScope 源 |
| `schedule_self_restart()` | main.py | 热更新重启废弃 |
| `data/update_backups/` | 数据目录 | 不再写入 |
| ModelScope 双源切换 UI | index.html | Electron 仅面向 GitHub Releases |

### 9.5 前端更新 UI

```
frontend/src/features/update/
├── hooks/
│   └── useCheckUpdate.ts       # 启动自动检测 + 手动触发
├── components/
│   ├── UpdateBadge.tsx         # 侧栏 GitHub 按钮红点
│   └── UpdateModal.tsx         # changelog +「前往下载」
└── index.ts
```

| 交互 | 行为 |
|------|------|
| 启动自动检测 | `ShellLayout` mount 时调用 |
| 侧栏红点 | `update_available === true` |
| 点击 / 设置页「检测更新」 | 打开 `UpdateModal` |
| 「前往下载」 | `infiniteCanvasDesktop.openExternal(release_url)` |
| 已是最新 | Toast「已是最新版本」 |
| 网络不可达 | Toast「无法连接 GitHub，请检查网络」 |

---

## 10. 测试策略

> 参考：[Electron 官方自动化测试文档](https://www.electronjs.org/zh/docs/latest/tutorial/automated-testing)

### 10.1 测试分层

```
┌─────────────────────────────────────────────┐
│  E2E — Playwright _electron.launch           │  tests/e2e/electron/
├─────────────────────────────────────────────┤
│  集成 — pytest + httpx AsyncClient           │  backend/tests/integration/
├─────────────────────────────────────────────┤
│  单元 — Vitest (前端) + pytest (后端)        │  frontend/tests/ + backend/tests/unit/
├─────────────────────────────────────────────┤
│  安全 — bandit + npm audit + CSP lint        │  CI security job
└─────────────────────────────────────────────┘
```

### 10.2 E2E 测试（Playwright）

```typescript
// tests/e2e/fixtures/electron-app.ts
import { test as base, _electron as electron } from '@playwright/test';

export const test = base.extend({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        INFINITE_CANVAS_TEST: '1',
        INFINITE_CANVAS_PYTHON: process.env.INFINITE_CANVAS_PYTHON || '',
        NODE_ENV: 'test',
      },
    });
    await use(app);
    await app.close();
  },
  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForURL(/127\.0\.0\.1:\d+/, { timeout: 90_000 });
    await use(window);
  },
});
```

### 10.3 自定义 IPC TestDriver

用于跳过首启向导、控制后端：

```typescript
// tests/helpers/test-driver.ts
// 通过 process.send / process.on('message') 与主进程通信
// 环境变量 INFINITE_CANVAS_TEST=1 启用 electron/test-hooks.js
```

TestDriver 方法：
- `isReady()` — 应用就绪
- `skipCliSetup()` — 跳过 CLI 引导
- `getBackendPort()` — 获取动态端口
- `getBackendStatus()` — 后端运行状态

### 10.4 测试环境变量

| 变量 | 作用 |
|------|------|
| `INFINITE_CANVAS_TEST=1` | 启用 IPC TestDriver + 跳过首启向导 |
| `INFINITE_CANVAS_PYTHON` | CI 预装 venv 路径 |
| `USE_VITE=1` | Electron 开发模式走 Vite |
| `NODE_ENV=test` | 标记测试模式 |

### 10.5 四门门禁

| 门禁 | 工具 | 通过标准 |
|------|------|----------|
| **功能 E2E** | Playwright | 启动/导航/画布核心流程 pass |
| **单元** | Vitest + pytest | 核心模块覆盖率 ≥ 60% |
| **集成** | pytest-httpx | API 契约全绿；已删除端点返回 404 |
| **安全** | bandit + npm audit | 0 high/critical；CORS 仅 localhost |

### 10.6 更新相关测试

| 测试 | 内容 |
|------|------|
| 单元 | `check_update` mock GitHub API → 正确比较版本 |
| 集成 | `GET /api/check-update` 返回 `release_url`；`POST /api/update-from-github` 返回 404 |
| E2E | mock 新版本 → 侧栏红点 → 弹窗 → `openExternal` 被调用 |
| 安全 | 确认无文件写入端点 |

### 10.7 package.json scripts

```json
{
  "test": "npm run test:unit && npm run test:e2e",
  "test:unit": "npm run test -w frontend && pytest backend/tests/unit -q",
  "test:integration": "pytest backend/tests/integration -q",
  "test:e2e": "playwright test",
  "test:security": "bandit -r backend/ && npm audit --audit-level=high",
  "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e && npm run test:security"
}
```

---

## 11. CI/CD 与发布

### 11.1 现有发布流程（保留）

```
推送 v* tag → GitHub Actions release-desktop.yml
  → macOS arm64/x64 .dmg
  → Windows .exe (NSIS) + .zip
  → 创建 GitHub Release 并上传
```

### 11.2 新增测试工作流

```yaml
# .github/workflows/test-desktop.yml
name: Test Desktop
on: [push, pull_request]

jobs:
  backend-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -e "backend/[dev]"
      - run: pytest backend/tests/ -v

  electron-e2e:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: python -m venv .venv-ci && .venv-ci/bin/pip install -e "backend/[dev]"
      - run: npm ci && npx playwright install
      - run: npx playwright test
        env:
          INFINITE_CANVAS_PYTHON: ${{ github.workspace }}/.venv-ci/bin/python
          INFINITE_CANVAS_TEST: '1'

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install bandit && bandit -r backend/ -x tests
      - run: npm audit --audit-level=high
```

### 11.3 合并门禁

`dev` → `main` 合并前必须通过：
- `test:all` 四门全绿
- Playwright E2E pass
- electron-builder 打包成功

### 11.4 发布产物变更

| 产物 | 变更 |
|------|------|
| `extraResources` | `backend/**` + `frontend/dist/**` 替代 `main.py` + `static/**` |
| `DESKTOP_BUILD_ID` | 机制不变 |
| `VERSION` | 机制不变 |
| 代码签名 | 暂不引入（保持现状） |

---

## 12. 实施阶段与里程碑

### 12.1 总览

| 阶段 | 周期 | 人周 | 交付物 |
|------|------|------|--------|
| Phase 0 — 基线 | 2 周 | 3 | 目录脚手架、简化 check-update、Playwright 基线 |
| Phase 1 — 后端 | 3 周 | 6 | backend/ 模块化、删除热更新、pytest |
| Phase 2 — 核心画布 | 6 周 | 12 | frontend/ 脚手架 + smart-canvas + canvas + 更新 UI |
| Phase 3 — 其余页面 | 3 周 | 6 | 13 页迁移 + i18next |
| Phase 4 — 集成发布 | 2 周 | 3 | 删除 static/、CI 全绿、打包 E2E |
| **合计** | **~16 周** | **~30 人周** | |

### 12.2 Phase 0 — 基线与脚手架（2 周）

**前置条件**（用户自行处理）：
- [x] 提交当前 WIP 到 `main`
- [x] 创建 `dev` 分支

**交付物**：
- [ ] 创建 `backend/`、`frontend/`、`tests/` 目录骨架
- [ ] 添加 `pyproject.toml`、`.nvmrc`、`.python-version`
- [ ] 更新根 `package.json` npm workspaces
- [ ] 实现简化版 `GET /api/check-update`（仅 GitHub Releases）
- [ ] 添加 `playwright.config.ts` + `app.launch.spec.ts`
- [ ] 更新 `.gitignore`
- [ ] 标记 `run.bat`、`mac-启动服务.sh` 为 `DEV_ONLY`

**门禁**：Playwright 能启动 Electron 并访问 `/api/app-info`

### 12.3 Phase 1 — 后端模块化（3 周）

**交付物**：
- [ ] `main.py` 拆分为 `backend/routers/` + `services/` + `models/`
- [ ] 删除热更新相关代码（§9.4 清单）
- [ ] CORS 收紧
- [ ] `electron/main.js` 改用 `backend.main:app` 启动
- [ ] pytest 集成测试覆盖所有保留 API
- [ ] 删除根目录 `main.py`

**门禁**：`pytest backend/tests/integration` 全绿；`POST /api/update-from-github` 返回 404

### 12.4 Phase 2 — 核心画布（6 周）

**交付物**：
- [ ] `frontend/` Vite + React + TS + Tailwind 脚手架
- [ ] `ShellLayout` + 路由 + `UpdateBadge` / `UpdateModal`
- [ ] `smart-canvas` React 重写（§7.2 拆分路径）
- [ ] `canvas` React 重写
- [ ] `canvas-list` + `settings` 页面
- [ ] i18next 基础框架 + 画布相关语言包
- [ ] Vitest 覆盖画布状态机

**门禁**：画布 E2E pass（创建节点、拖拽、运行生成 mock）

### 12.5 Phase 3 — 其余页面（3 周）

**交付物**：
- [ ] 迁移 api-settings、asset-manager、comfyui-settings、gpt-chat
- [ ] 迁移 tools、enhance、klein、zimage、angle、online
- [ ] 补全 i18n 语言包
- [ ] 全页面 Playwright E2E

**门禁**：15 个页面路由可达 + 核心交互 pass

### 12.6 Phase 4 — 集成发布（2 周）

**交付物**：
- [ ] 删除 `static/` 目录
- [ ] 更新 `electron-builder` extraResources
- [ ] 更新 `release-desktop.yml`
- [ ] 添加 `test-desktop.yml` CI
- [ ] `test:all` 四门全绿
- [ ] 打包产物 E2E（安装 → 启动 → 检测更新）

**门禁**：`dev` → `main` 合并

---

## 13. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 功能回退（Big Bang） | 🔴 高 | Phase 0 录制 Playwright E2E 基线；每阶段回归 |
| 画布交互丢失 | 🔴 高 | 先提取状态机为纯 TS 模块，与 UI 解耦；逐功能对比测试 |
| 迁移周期过长 | 🟡 中 | MVP 功能清单；非核心页面可延后 |
| API 契约破坏 | 🟡 中 | OpenAPI schema 生成 TS 类型；集成测试覆盖 |
| 打包体积增大 | 🟡 低 | React 构建 + tree-shaking；监控 dist 大小 |
| 首启依赖安装回归 | 🟡 中 | E2E 覆盖首启流程；TestDriver 跳过加速 CI |
| 无代码签名 | 🟢 已知 | 保持手动下载安装；不引入 electron-updater |

---

## 14. 待评审开放问题

> 以下问题需 Codex 评审时确认或补充意见。

### 14.1 架构

- [ ] **Q1**: `frontend/dist` 由 FastAPI 托管 vs Electron `loadFile()` 直接加载，哪种更适合本项目？
- [x] **Q2**: 开发模式采用 Vite + Electron 两进程编排；Electron 负责启动后端并自动选择空闲端口，避免固定 3000 冲突。
- [ ] **Q3**: `VersionedStaticFiles`（HTML/CSS 运行时注入 `?v=` 缓存破坏）在 React SPA 下是否还需要？

### 14.2 后端

- [ ] **Q4**: Router 拆分粒度 — 9 个 router 文件是否足够？是否需要更细（如 `ai_providers` 拆为 openai/gemini/volcengine）？
- [ ] **Q5**: `services/` 层是否引入 Repository 模式访问 `data/` 文件？还是保持现有直接文件 IO？
- [ ] **Q6**: 是否需要引入 `alembic` 或数据库？当前全文件存储。

### 14.3 前端

- [ ] **Q7**: smart-canvas 节点渲染 — 大量节点（100+）时是否需要 Canvas 2D/WebGL 渲染层而非 DOM？
- [ ] **Q8**: 现有 `static/css/*.css` 的设计 token（`--accent`、`--bg` 等）如何迁移到 Tailwind 配置？
- [ ] **Q9**: iframe 嵌套页面（settings 中嵌入 api-settings）是否改为 React 子路由？

### 14.4 Electron

- [ ] **Q10**: 首启 Python 自动安装是否继续使用嵌入式 Python 3.12.8？还是统一到 3.11？
- [ ] **Q11**: `asar: false` 是否保持？改为 `asar: true` 可减小包体积。
- [ ] **Q12**: 是否需要引入 `electron-updater` 仅做「检测到新版本 → 提示」而不自动下载？

### 14.5 测试

- [ ] **Q13**: E2E 测试中 ComfyUI / 外部 API 调用是否全部 mock？还是允许集成测试环境？
- [ ] **Q14**: 覆盖率 60% 门槛是否合适？画布核心模块是否要求 80%？
- [ ] **Q15**: 是否需要视觉回归测试（Playwright screenshot diff）？

### 14.6 发布

- [ ] **Q16**: `VERSION` 格式 `2026.07.6` 是否保持不变？
- [ ] **Q17**: Chrome/PS 插件是否需要同步更新以适配新 API 路径？
- [ ] **Q18**: ModelScope 空间是否继续同步发布？（仅作为代码镜像，非更新源）

---

## 15. 决策记录

| # | 决策项 | 选择 | 日期 | 决策人 |
|---|--------|------|------|--------|
| D1 | 迁移策略 | Big Bang 一次性重写 | 2026-07-09 | 项目负责人 |
| D2 | 后端改造 | 模块化拆分 backend/ | 2026-07-09 | 项目负责人 |
| D3 | 迁移优先级 | Canvas First | 2026-07-09 | 项目负责人 |
| D4 | 后端入口 | `backend/main.py` 独立脚手架入口，不依赖 legacy `main.py` | 2026-07-09 | 项目负责人 |
| D5 | 旧资产归档 | `main.py`、`static/`、旧脚本、旧文档归档到 `history/`，后续由 Cursor 按需参考迁移 | 2026-07-09 | 项目负责人 |
| D6 | Python 工具链 | pyproject.toml + ruff + pytest | 2026-07-09 | 项目负责人 |
| D7 | 运行时版本 | Node 22 + Python 3.11 | 2026-07-09 | 项目负责人 |
| D8 | 前端栈 | Vite 6 + React 19 + TS 5 + Tailwind 4 | 2026-07-09 | 项目负责人 |
| D9 | 画布方案 | 自研 React 组件 | 2026-07-09 | 项目负责人 |
| D10 | i18n | i18next | 2026-07-09 | 项目负责人 |
| D11 | 包管理 | npm workspaces | 2026-07-09 | 项目负责人 |
| D12 | 开发分支 | dev | 2026-07-09 | 项目负责人 |
| D13 | 产品形态 | 仅 Electron 桌面应用 | 2026-07-09 | 项目负责人 |
| D14 | 热更新 | 完全移除 | 2026-07-09 | 项目负责人 |
| D15 | 桌面更新 | 仅检测 + 提示 + 跳转 Releases | 2026-07-09 | 项目负责人 |
| D16 | Web 更新 | 完全移除（含 ModelScope 源） | 2026-07-09 | 项目负责人 |
| D17 | 更新 UI | ShellLayout 侧栏红点 + 设置页 | 2026-07-09 | 项目负责人 |
| D18 | electron-updater | 不引入（无代码签名） | 2026-07-09 | 项目负责人 |
| D19 | E2E 框架 | Playwright + IPC TestDriver | 2026-07-09 | 项目负责人 |
| D20 | Git 分支 | 在 `dev` 分支进行重构 | 2026-07-09 | 项目负责人 |
| D21 | Electron 版本 | 使用 npm 最新稳定版 Electron 43.1.0，安全门禁优先于旧版固定 | 2026-07-09 | Codex 评审 |
| D22 | Phase 0 门禁 | 建立 npm workspaces、独立 backend 脚手架、Vitest/pytest/Playwright/Bandit/audit 基线 | 2026-07-09 | Codex 评审 |
| D23 | 后续执行 | Cursor 负责业务功能迁移；Codex 当前交付到脚手架成功为止 | 2026-07-09 | 项目负责人 |

### 15.1 Codex 评审结果（2026-07-09）

| 门禁 | 命令 | 当前结果 |
|------|------|----------|
| 构建 | `npm run build:desktop` | ✅ 通过，生成 macOS DMG |
| 单元 | `npm run test:unit` | ✅ 通过 |
| 集成 | `npm run test:integration` | ✅ 通过 |
| 功能 E2E | `npm run test:e2e` | ✅ 通过（Phase 0 smoke） |
| 安全 | `npm run test:security` | ✅ 通过，`bandit` 无发现，`npm audit` 0 vulnerabilities |
| 全量 | `npm run test:all` | ✅ 通过 |

评审结论：
- 当前仓库已具备 Phase 0 可执行门禁；后续页面/画布迁移必须在这些门禁上增量扩展。
- `backend/main.py` 是独立最小后端脚手架，保留 `/api/app-info` 与 `/api/check-update` 作为桌面基础 API。
- legacy 源码、脚本、文档已移动到 `history/`，后续迁移时应从 `history/main.py`、`history/static/`、`history/docs/`、`history/scripts/` 按需参考，而不是继续扩展旧根目录结构。
- 热更新写入类端点已进入废弃路径，集成测试要求返回 404；桌面更新只保留 GitHub Releases 检测与跳转。
- Electron 版本以 npm 最新稳定版为准；如安全审计再次提示 high/critical，应优先升级并更新本文档。

---

## 附录 A：现有 API 端点分类（153 个）

<details>
<summary>点击展开完整端点列表</summary>

### system (~5)
- `GET /api/app-info`
- `GET /api/check-update`
- `GET /api/update-connectivity` → **删除**
- `GET /api/update-connectivity/probe` → **删除**
- `POST /api/update-from-github` → **删除**
- `GET /api/update-backups` → **删除**
- `POST /api/update-rollback` → **删除**

### canvases (~25)
- `GET/POST/PUT/DELETE /api/canvases/*`
- `GET /api/canvases/trash`
- WebSocket `/ws/stats`

### media (~15)
- `GET /api/media-preview`
- `GET /api/image-jpeg`
- `GET /api/download-output`
- `POST /api/upload`
- `POST /api/ai/upload`
- `POST /api/ai/upload-base64`

### assets (~20)
- `GET/POST /api/local-assets/*`

### comfyui (~15)
- `POST /api/comfyui/*`

### runninghub (~20)
- `GET/POST/PUT/DELETE /api/runninghub/*`

### ai_providers (~30)
- 各 Provider 的 generate/chat/status 端点

### cli_tools (~15)
- `GET/POST /api/codex/*`
- `GET/POST /api/gemini-cli/*`
- `GET/POST /api/jimeng/*`

</details>

## 附录 B：根 package.json 完整 scripts

```json
{
  "name": "infinite-canvas",
  "version": "2026.07.6",
  "private": true,
  "workspaces": ["frontend"],
  "main": "electron/main.js",
  "scripts": {
    "desktop": "electron .",
    "electron": "electron .",
    "dev": "concurrently -k \"npm run dev:frontend\" \"npm run dev:electron\"",
    "dev:backend": "python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 3000",
    "dev:frontend": "npm run dev -w frontend",
    "dev:electron": "wait-on http://127.0.0.1:5173 && USE_VITE=1 electron .",
    "build:frontend": "npm run build -w frontend",
    "build:desktop": "npm run build:frontend && npm run dist",
    "test": "npm run test:all",
    "test:unit": "npm run test -w frontend && pytest backend/tests/unit -q",
    "test:integration": "pytest backend/tests/integration -q",
    "test:e2e": "playwright test",
    "test:security": "bandit -r backend -x backend/tests && npm audit --registry=https://registry.npmjs.org --audit-level=high",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e && npm run test:security",
    "pack": "npm run prebuild:desktop && electron-builder --dir",
    "dist": "npm run prebuild:desktop && electron-builder",
    "dist:mac": "npm run prebuild:desktop && electron-builder --mac dmg",
    "dist:win": "npm run prebuild:desktop && electron-builder --win nsis zip",
    "prebuild:desktop": "node scripts/write-desktop-build-id.js",
  }
}
```

---

*本文档将随评审反馈持续更新。*
