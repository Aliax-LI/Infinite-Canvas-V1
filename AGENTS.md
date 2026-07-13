# 仓库贡献指南

## 开发前必读

开始任何代码任务前，先阅读根目录的 `PROJECT_CONTEXT.md`，确认当前架构、进行中的工作、已知限制和近期变更。涉及页面、组件、样式或交互时，还必须阅读 [DESIGN.md](DESIGN.md)。若文档与代码不一致，以代码和测试结果为准，并在本次任务中修正文档。不要在 `NOTES.md`、聊天记录或个人文件中维护另一套项目事实来源。

## 统一可写数据根（强制）

应用可写持久化必须落在 **设置 → 存储** 所展示的「数据目录」之下（后端 `DATA_DIR` / 环境变量 `INFINITE_CANVAS_DATA_DIR`）。该路径是用户可见的唯一存储根；`/api/storage/stats` 返回的 `data_dir` 为真相来源。

- **必须放入该根（或其子目录）**：画布与 JSON/SQLite 文档、`objects/`（对象存储，亦作 `ASSETS_DIR`）、`output/`、备份、媒体预览等所有应用写入数据。
- **禁止**为新功能在仓库顶层再拆平行根目录（例如另起一套顶层 `assets/`、`output/` 与 `data/` 不一致的写入路径）。应在现有 `DATA_DIR` 下扩展子目录。
- **Electron / 打包桌面端**：打包后默认使用稳定的 userData 数据目录（或用户在首次安装向导中选择的目录）；须仍能在设置页显示并「打开数据目录」。后端 `config.py` 与 `electron/storage-setup.js` 必须对同一 `DATA_DIR` 达成一致（Electron 通过环境变量注入）。
- **覆盖方式**：优先 `INFINITE_CANVAS_DATA_DIR`；个别子树可用 `INFINITE_CANVAS_OBJECTS_DIR` / `INFINITE_CANVAS_OUTPUT_DIR` 等覆盖，但默认仍应解析到 `DATA_DIR` 之下。仓库内捆绑的只读资源（如 `workflows/` 模板、`API/.env` 开发默认）除外。
- **遗留迁移**：启动时后端会把仓库顶层 `assets/`（及顶层 `output/`）中尚不存在于目标的文件幂等复制到 `DATA_DIR/objects/`（及 `DATA_DIR/output/`）；不删除源目录，仍作 `LEGACY_*` 只读回退。Electron `initializeStorage` 同样把应用目录/`legacyParent` 下的 `assets` 以「目标已有则跳过」方式并入 `objects/`。URL 仍为 `/assets/...`，由 `ASSETS_DIR`（=`objects/`）优先解析。
- **变更存储布局时**：同一变更中更新 `PROJECT_CONTEXT.md`，并保持本条规则与实现一致。

## 项目结构与模块组织

- `frontend/src/` 是基于 React 19 和 Vite 的客户端。业务模块放在 `features/`；通用 API 客户端、Hooks、状态仓库、UI 组件和工具函数放在 `shared/`。
- `backend/` 是 FastAPI 服务。HTTP 接口位于 `routers/`，业务逻辑位于 `services/`，持久化实现通过 `repositories/` 隔离，数据库与存储相关代码位于 `storage/`。
- `electron/` 包含桌面端主进程、预加载和安装引导脚本。

测试按应用边界分布在 `frontend/tests/`、`backend/tests/{unit,integration}/`、`tests/unit/electron/` 和 `tests/e2e/electron/`。构建资源放在 `build/`，维护脚本放在 `scripts/`，项目文档放在 `docs/`。除非迁移任务明确涉及，否则将 `history/` 视为仅供参考的旧版代码。

## 构建、测试与开发命令

使用 `npm install` 安装 JavaScript 依赖。Python 要求 3.11 或更高版本，建议运行 `uv sync --extra dev` 安装依赖。

- `npm run dev`：启动 Vite 和 Electron；Electron 会同时启动后端。
- `npm run dev:backend`：仅启动后端 API，默认端口为 3000。
- `npm run build:frontend`：将前端构建到 `frontend/dist/`。
- `npm run test:unit`：运行 Electron、Vitest、国际化校验和后端单元测试。
- `npm run test:integration`：运行 FastAPI 集成测试。
- `npm run test:e2e`：构建前端并运行 Electron Playwright 测试。
- `npm test`：运行完整测试，包括 Bandit 和 `npm audit` 安全检查。
- `npm run dist:mac` / `npm run dist:win`：生成对应平台的安装包。

## 编码风格与命名约定

TypeScript/TSX 使用两个空格缩进、双引号和分号；Python 使用四个空格缩进并遵循 PEP 8。Ruff 以 Python 3.11 为目标，行宽上限为 120 个字符。React 组件和类型使用 `PascalCase`，前端函数与变量使用 `camelCase`，Python 模块和函数使用 `snake_case`。业务代码应放在所属功能目录中。修改用户可见文本时，同时更新 `frontend/src/shared/i18n/locales/en/` 和 `zh/`，并运行国际化校验。

## 字体与 UI 规范

[DESIGN.md](DESIGN.md) 是字体、色彩、间距、组件状态、响应式和可访问性规则的唯一规范。新增 UI 应优先复用 `frontend/src/index.css` 中的主题变量和 `frontend/src/shared/ui/` 中的组件，不得另建近似色值或重复组件。图标统一使用 `lucide-react`，禁止用 Emoji 代替功能图标。若 UI 变更引入新的视觉模式、设计 Token 或交互约定，必须在同一变更中更新该规范，并在明暗主题下检查关键状态。

## 测试规范

前端测试命名为 `*.test.ts(x)`，Python 测试命名为 `test_*.py`，Playwright 测试命名为 `*.spec.ts`。为受影响的业务逻辑补充单元测试；涉及 API 或持久化契约时补充集成测试。项目没有固定覆盖率门槛，但新增行为和回归问题必须有直接测试。开发时运行最小相关测试集，发布相关改动前运行 `npm test`。

## 项目上下文维护

`PROJECT_CONTEXT.md` 是项目上下文的唯一规范文件。每次代码变更都必须在同一任务、同一提交或同一 Pull Request 中更新该文件；仅修改文档、拼写或格式且不影响行为时，可以不新增变更记录。

更新时遵循以下规则：

- 架构、目录职责、数据流或外部依赖发生变化时，直接修订对应的长期说明，删除已经失效的描述。
- 在“近期变更”顶部新增一条记录，格式为 `YYYY-MM-DD — 变更主题`，并写明涉及路径、行为变化、关键决策和验证命令。
- 记录面向后续开发者的事实和约束，不粘贴完整代码、终端日志或聊天过程。
- 未完成工作、兼容性风险和待办事项放入“进行中与已知问题”，完成后及时移除。
- 提交前检查代码、测试和上下文三者一致；缺少上下文更新的代码变更视为未完成。

## 提交与 Pull Request 规范

提交信息遵循仓库现有的 Conventional Commits 格式，例如 `feat: 添加画布快捷键`、`fix: 处理资源缺失`、`docs: 更新安装说明`。每个提交只处理一个明确主题，不要将生成产物与源码改动混在一起。代码提交必须包含对应的 `PROJECT_CONTEXT.md` 更新。Pull Request 应说明改动目的和验证方式，关联相关 Issue，注明存储或配置迁移；UI 改动需附截图或短视频。禁止提交 API 密钥、本地数据目录或生成的安装包。
