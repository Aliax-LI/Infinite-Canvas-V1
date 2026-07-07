# 无限画布桌面版

面向最终用户的分发方式是 **安装包**（Windows NSIS `.exe`、macOS `.dmg`），无需手动运行 bat/sh 或命令行安装依赖。

## 用户使用方式

1. 下载并运行安装包（`npm run dist` 生成）
2. 从桌面或开始菜单打开「无限画布」
3. 首次启动时，应用会自动：
   - 检测本机 Python 3.10+（Homebrew、Conda、系统 Python 等）
   - 若未找到，**自动下载并安装** Python 到用户数据目录（无需手动去 python.org）
   - 通过清华 PyPI 镜像安装 `requirements.txt` 依赖
   - 在图形界面中显示初始化进度
4. **步骤 2（可选）**：安装 CLI 工具，一键安装：
   - OpenAI Codex CLI（聊天）
   - GPT Image 2 Helper（生图，解决「未找到 GPT Image 2 helper」）
   - 即梦 CLI、Gemini CLI（可选）
   - npm 安装使用 npmmirror 国内镜像；已安装的工具自动跳过
   - 可点击「跳过，稍后配置」直接进入主界面
5. 全程零手动步骤；仅当自动安装多次失败时，才提供「重试」或打开官方下载页作为最后手段

## 开发者打包

项目已配置国内 npm 镜像（`.npmrc`）：

```bash
npm install
npm run dist
```

### 镜像源

| 用途 | 镜像 |
|------|------|
| npm | `https://registry.npmmirror.com` |
| Electron 二进制 | `https://npmmirror.com/mirrors/electron/` |
| Windows Python 嵌入式包 | `https://npmmirror.com/mirrors/python/` |
| macOS Python（Miniforge） | 清华 GitHub Release 镜像 |
| pip（首启自动安装） | `https://pypi.tuna.tsinghua.edu.cn/simple` |

### 本地调试

```bash
npm run desktop
```

开发模式下同样会走首启依赖检测与自动安装逻辑。

## 打包产物

- macOS：`dist-electron/无限画布-x.x.x-arm64.dmg`
- Windows：`dist-electron/无限画布 Setup x.x.x.exe`
- 应用目录：`dist-electron/mac-arm64/无限画布.app`

## GitHub Actions 自动发布

推送版本 tag 后，会自动在 macOS / Windows 上构建安装包并创建 [GitHub Release](https://github.com/Aliax-LI/Infinite-Canvas-V1/releases) 供下载。

### 发布步骤

1. 更新版本号（保持 `VERSION` 与 `package.json` 的 `version` 一致）：

```bash
echo "2026.07.7" > VERSION
# 同步 package.json 中的 version 字段
```

2. 提交并打 tag（必须以 `v` 开头）：

```bash
git add VERSION package.json
git commit -m "chore: 发布 2026.07.7"
git tag v2026.07.7
git push origin main --tags
```

3. Actions 工作流 `Release Desktop` 会自动：
   - 构建 macOS `arm64` / `x64` 的 `.dmg`
   - 构建 Windows `.exe`（NSIS）与 `.zip`
   - 创建 Release 并上传安装包

### 手动触发（不打 tag）

在 GitHub → Actions → **Release Desktop** → **Run workflow**：

- 填写 `version`（如 `2026.07.7`）
- 勾选 `create_release` 可创建对应 Release

> CI 构建未做代码签名，macOS 首次打开可能需在「系统设置 → 隐私与安全性」中允许；Windows 可能触发 SmartScreen 提示。

图标来源于 `static/images/logo.png`，产物名称为中文「无限画布」。

## 数据目录

打包后首次启动会将运行文件复制到用户数据目录：

```text
macOS: ~/Library/Application Support/infinite-canvas-desktop/runtime
Windows: %APPDATA%/infinite-canvas-desktop/runtime
```

自动安装的 Python：

```text
macOS: ~/Library/Application Support/infinite-canvas-desktop/python/
Windows: %APPDATA%/infinite-canvas-desktop/python/
```

依赖安装状态缓存：`deps-state.json`（同 userData 目录）

CLI 引导完成状态：`cli-setup-state.json`（同 userData 目录；跳过或完成后不再显示 CLI 步骤）

## 安装后界面仍是旧版？

打包应用会把程序文件复制到用户数据目录的 `runtime/`，**仅当 `VERSION` 或 `DESKTOP_BUILD_ID` 变化时才会覆盖更新**。若版本号未变（例如多次构建都是 `2026.07.6`），可能继续沿用旧缓存。

**解决办法（任选其一）：**

1. 安装新版安装包后完全退出应用，再重新打开（新版会写入新的 `DESKTOP_BUILD_ID` 并自动同步）
2. 手动删除运行时缓存后重启：
   - macOS：`~/Library/Application Support/infinite-canvas-desktop/runtime`
   - Windows：`%APPDATA%/infinite-canvas-desktop/runtime`

## 备用脚本（仅开发/排障）

`安装依赖.bat`、`mac-安装依赖.sh` 保留为开发者备用，普通用户无需使用。

## 自定义 Python 路径

若本机已有 Python 但应用未找到，可设置环境变量跳过自动安装：

```bash
export INFINITE_CANVAS_PYTHON=/path/to/python3
```
