# 项目上下文

本文件是 Infinite Canvas 的长期项目上下文。开始代码任务前先阅读；每次代码变更后同步更新。内容应保持简洁、准确，并能帮助后续开发者在不依赖聊天记录的情况下继续工作。

## 系统概览

- `frontend/`：React 19、TypeScript、Vite 客户端，按 `features/` 组织业务功能。
- `backend/`：Python 3.11+、FastAPI 服务，按路由、服务、仓储和存储层分工。
- `electron/`：桌面端主进程和预加载逻辑，开发模式下负责启动后端并加载 Vite 页面。
- 前端通过 `/api`、`/ws`、`/output` 等路径访问本地后端；Vite 开发服务器会将这些请求代理到后端。

## 核心约束

- 用户可见文本必须同时维护英文和中文本地化资源。
- HTTP 接口、业务逻辑和持久化实现应分别保留在 `routers/`、`services/` 和 `repositories/`。
- 新增行为或修复回归时，应添加覆盖该行为的测试。
- 不提交密钥、本地用户数据、构建产物或平台安装包。
- **可写数据唯一根**：所有应用写入必须落在设置 → 存储的「数据目录」（`DATA_DIR` / `INFINITE_CANVAS_DATA_DIR`）下；详见 `AGENTS.md`「统一可写数据根」。开发默认 `./data`；打包桌面端默认 Electron `userData/data`（或首次向导所选路径）。子目录：`objects/`（媒体/对象存储，亦为 `ASSETS_DIR`）、`output/`、`canvases/`、备份等。仓库顶层遗留 `assets/` 仅作只读回退；启动时会把其中缺失文件幂等复制进 `DATA_DIR/objects/`，新写入不得再依赖顶层 `assets/`。

## 进行中与已知问题

- 暂无。新增未完成工作时，请注明负责人或来源、影响范围和下一步。

## 近期变更

### 2026-07-13 — 修复经典 MS ZImage 误走 Comfy 与空 502 错误展示

- 涉及路径：`msGenModels.ts`、`runNodeGeneration.ts`、`formatError.ts`、`client.ts`、`ms_generate_service.py`、`routers/generate.py`、`comfy_generate_service.py`、`vite.config.ts`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：ZImage Tab 改走 ModelScope `/api/ms/generate`（`Tongyi-MAI/Z-Image-Turbo` + size），不再误打 Comfy `/api/generate`；恢复历史兼容 `POST /generate`；API/节点错误优先展示 `detail`/`message`/响应体，空 `HTTP Error 502:` 改为可读说明。
- 关键决策：历史 `/generate` 在 Vite 下需额外代理；画布主路径统一 `/api/ms/generate`，与工具页云端 Z-Image 一致。
- 验证：`npx vitest run tests/shared/formatError.test.ts tests/canvas/node-generation.test.ts`；`pytest backend/tests/integration/test_generate_api.py backend/tests/integration/test_migration_parity.py -q`。

### 2026-07-13 — 经典 MODELSCOPE 节点对齐历史 + 生成节点密钥门控

- 涉及路径：`msGenModels.ts`、`msLora.ts`、`generationKeyGate.ts`、`GeneratorNodeBody.tsx`、`ConnectedInputsSummary.tsx`、`runNodeGeneration.ts`、`chat/types.ts`、canvas i18n、`DESIGN.md`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：MODELSCOPE生成对齐历史 Tab（ZImage / Qwen Edit / Klein / 自定义）、1K/比例/数量、按模型显示 IMAGES、LoRA 启用与无绑定引导；缺少 API Key / Comfy 实例时生成节点置灰并链到设置，运行按钮禁用；`runCanvasNode` 同步拦截。
- 关键决策：门控复用 `/api/config` 的 `has_ms_key` / `has_key`，不另建配置；MS 运行按 Tab 走历史 endpoint。
- 验证：`npx vitest run tests/canvas/generation-key-gate.test.ts tests/canvas/generator-node-body.test.tsx tests/canvas/node-generation.test.ts`。

### 2026-07-13 — 回收站支持批量删除与恢复

- 涉及路径：`TrashPanel.tsx`、`CanvasListPage.tsx`、`canvas-list/api.ts`、`backend/routers/canvases.py`、`canvas_service.py`、`models/canvas.py`、canvas i18n、`DESIGN.md`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：回收站卡片增加多选 checkbox 与全选栏；支持批量恢复、批量彻底删除（二次确认）；后端新增 `/api/canvases/trash/restore-batch` 与 `/api/canvases/trash/purge-batch`，返回成功/失败计数。
- 关键决策：历史画布回收站无批量 UX，对齐历史图片批量管理（全选 + 确认删除）与素材库 manage bar；薄批量 API 避免前端 N 次往返。
- 验证：`npx vitest run tests/canvas-list/trash-panel.test.tsx`；`pytest backend/tests/integration/test_canvases_api.py backend/tests/integration/test_migration_parity.py -q`。

### 2026-07-13 — 图片右键创建导入图片节点

- 涉及路径：`ImageContextMenu.tsx`、`clipboard.ts`（`createImportImageNodeFromSource`）、`OutputNodeBody.tsx`、`LegacyNodeCard.tsx`、`LegacyCanvasPage.tsx`、`ImageEditModal.tsx`、canvas i18n、`DESIGN.md`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：OUTPUT / IMAGE 缩略图右键可「预览」或「创建导入图片节点」；预览弹窗预览态右键同样可创建。新 IMAGE 放在源节点右侧（同裁剪流程），不自动连线。
- 关键决策：对齐裁剪/蒙版/扩图的 `imageEditOutputPoint` 放置；单图 URL 派生，不做整组 convert。
- 验证：`npx vitest run tests/canvas/image-context-menu.test.tsx tests/canvas/image-edit-modal.test.tsx`。

### 2026-07-13 — 经典图片编辑蒙版笔刷粗细

- 涉及路径：`ImageEditModal.tsx`、`imageEdit.ts`（`clampMaskBrushSize` / `MASK_BRUSH_*`）、`studio.css`、canvas i18n、`DESIGN.md`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：蒙版模式底部增加笔刷直径滑块（4–160，默认 42，对齐历史 `maskBrushSize`）；涂抹使用该线宽；悬停显示圆形笔刷预览。
- 关键决策：仅改图片编辑弹窗蒙版工具，不引入独立画笔编辑模式。
- 验证：`npx vitest run tests/canvas/imageEdit.test.ts tests/canvas/image-edit-modal.test.tsx`。

### 2026-07-13 — OUTPUT 多图缩略图铺满单元格

- 涉及路径：`OutputNodeBody.tsx`、`studio.css`、`output-node-body.test.tsx`、`DESIGN.md`、`PROJECT_CONTEXT.md`。
- 行为变化：多图网格缩略图强制 `object-cover` 铺满方格，去掉灰底 letterbox/pillarbox；单图 hero 仍按固有比例铺满宽度且透明底；点击预览与计时徽章不变。
- 关键决策：仅改 OUTPUT 展示拟合，不改 `imageFit` 设置语义与其他节点；pending 占位槽仍保留软底。
- 验证：`npx vitest run tests/canvas/output-node-body.test.tsx`。

### 2026-07-13 — 经典图片编辑舞台透明棋盘格

- 涉及路径：`studio.css`（`.studio-transparency-board`）、`ImageEditModal.tsx`、`DESIGN.md`、`image-edit-modal.test.tsx`、`PROJECT_CONTEXT.md`。
- 行为变化：经典画布图片预览/编辑舞台由纯灰底改为灰白透明棋盘格；图片元素背景改为透明，缩放/平移/裁剪交互不变。
- 关键决策：抽出可复用 `.studio-transparency-board`（含暗色主题），无现成素材库棋盘样式可复用。
- 验证：`npx vitest run tests/canvas/image-edit-modal.test.tsx`。

### 2026-07-13 — 经典 API 生成使用连线 PROMPT

- 涉及路径：`nodeSources.ts`（`resolveGenerationPrompt`）、`runNodeGeneration.ts`、`LegacyCanvasPage.tsx`、`GeneratorNodeBody.tsx`、`LegacyNodeCard.tsx`（输入端口对称定位）、canvas i18n、`DESIGN.md`、`node-generation.test.ts`、`PROJECT_CONTEXT.md`。
- 行为变化：PROMPT→API 连线文本写入 `/api/canvas-image-tasks` 的 `prompt`（本地 textarea 为空时亦生效；有本地内容则 `\n\n` 追加）。生成日志 / OUTPUT pending 使用同一有效提示词。有连线时本地框标为「附加提示词」。输入端口改为与输出对称的 `-left-[15px]`，避免圆点落在卡片外被裁切。
- 关键决策：对齐历史 `runGenerator`（以上游 sources 为主）与 LLM「来自连线」语义；不把连线文本写回 `node.prompt`。
- 验证：`npx vitest run tests/canvas/node-generation.test.ts`。

### 2026-07-13 — 画布连接端口改为圆形

- 涉及路径：`studio.css`（`.legacy-node-port-dot` / `.smart-node-port`）、`LegacyNodeCard.tsx`、`smart-canvas/NodeCard.tsx`、`DESIGN.md`、`PROJECT_CONTEXT.md`。
- 行为变化：经典/智能画布左右连接点由正方形改为历史风格小实心圆点；全局 `border-radius: 0 !important` 下用类级 `9999px !important` 覆盖。
- 关键决策：仅改端口视觉，不改 hit box / `resolvePortPoint` 几何；智能端口去掉箭头文字。
- 验证：`npx vitest run tests/smart-canvas/ui-components.test.tsx`。

### 2026-07-13 — 经典画布图片预览弹窗放大与裁剪/扩图可拖移

- 涉及路径：`ImageEditModal.tsx`、`core/imageEdit.ts`、`LegacyCanvasPage.tsx`、`studio.css`、canvas i18n、`DESIGN.md`、`imageEdit.test.ts`、`image-edit-modal.test.tsx`、`PROJECT_CONTEXT.md`。
- 行为变化：预览舞台近全屏（对齐历史/素材库量级），支持滚轮与按钮缩放、预览拖拽平移；裁剪选区可拖移并带八向手柄；扩图为可拖图片 + 边框手柄；蒙版为画笔涂抹。应用裁剪/蒙版/扩图后在源节点右侧创建新 IMAGE 输入节点（`imageEditOutputPoint`，蒙版额外 +28y；不自动连线）。
- 关键决策：抽出 `moveCropRect`/`resizeCropRect`/`resizeOutpaintFrame`/`nextZoomLevel`/`imageEditOutputPoint` 等纯函数；裁剪/扩图不再写回原节点，统一拉出下游输入节点。
- 验证：`npx vitest run tests/canvas/imageEdit.test.ts tests/canvas/image-edit-modal.test.tsx`。

### 2026-07-13 — 经典 OUTPUT 节点对齐 ComfyUI SaveImage 紧凑布局

- 涉及路径：`OutputNodeBody.tsx`、`CanvasRunUi.tsx`（pending 槽）、`LegacyNodeCard.tsx`、`studio.css`、`DESIGN.md`、output 相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：错误行置顶；单图（可含错误）改为全宽按固有比例的 hero 预览，去掉灰底 letterbox 与底部大片留白；多图/进行中为密网格填满宽度；未手动 `sized` 时 OUTPUT 卡片 `minHeight` 降至拉伸下限，高度随内容收缩。
- 关键决策：参照 ComfyUI SaveImage「图优先、内容定高」；不改生成逻辑与预览弹窗。
- 验证：`npx vitest run tests/canvas/output-node-body.test.tsx tests/canvas/canvas-run-ui.test.tsx`。

### 2026-07-13 — 修复生成数量 count 翻倍 + OUTPUT 结果列表密度

- 涉及路径：`runNodeGeneration.ts`、`LegacyCanvasPage.tsx`、`OutputNodeBody.tsx`、`CanvasRunUi.tsx`、`studio.css`、canvas i18n、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：API 多图改为 `count` 路并行且每路 `n=1`（不再 `n=count`×并行导致 2→4）；MS 每路最多收 1 张；非 API/MS 种类只开 1 个 pending。OUTPUT 连续相同错误合并为紧凑行（×N），pending/成功缩略图网格化，减少空白与虚线大红块噪音。
- 关键决策：对齐历史 `runGenerator`（并行任务、payload 不含放大 n）；后端 `online_image` 仍按 `n` 扩图，客户端禁止双重乘法。
- 验证：`npx vitest run tests/canvas/node-generation.test.ts tests/canvas/output-node-body.test.tsx tests/canvas/canvas-run-ui.test.tsx tests/canvas/apply-generation-result.test.ts`。

### 2026-07-13 — 经典画布生成计时 / OUTPUT 预览 / 多张出图

- 涉及路径：`runState.ts`、`pendingOutput.ts`、`applyGenerationResult.ts`、`runNodeGeneration.ts`、`uploadMedia.ts`、`GeneratorNodeBody.tsx`、`OutputNodeBody.tsx`、`LegacyCanvasPage.tsx`、`types.ts`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：生成计时在 stamp 之后再进入 running，并忽略陈旧 `runStartedAt`，从 ~0s 起跳；OUTPUT 对远程 https 走预览代理并可点击预览多图；API/MS/RH 节点增加 1–8 张数量步进，按 count 并行提交任务并在 OUTPUT 展示多缩略图。
- 关键决策：对齐历史 `gen-count-row` + N 路 canvas-image / ms.generate；`canvasMediaPreviewUrl` 对非本地路径回退 `canvasDisplayMediaUrl`。
- 验证：`npx vitest run tests/canvas/runState.test.ts tests/canvas/canvas-run-ui.test.tsx tests/canvas/apply-generation-result.test.ts tests/canvas/output-node-body.test.tsx tests/canvas/persistence.test.ts`。

### 2026-07-13 — 画布快捷键 Win/Mac 双端适配

- 涉及路径：`shared/utils/platformShortcuts.ts`、经典/智能 `ShortcutsModal`/`ShortcutModal`、`QuickToolbar`、`smart-canvas/core/shortcuts.ts`、canvas/smart-canvas i18n、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：修饰键运行时统一 `metaKey || ctrlKey`（含立即保存 ⌘S/Ctrl+S）；帮助面板与工具栏按平台显示 ⌘/Ctrl（Mac 另标 Delete/Backspace、⌥）；智能画布帮助项对齐历史列表并含立即保存。
- 关键决策：共享 `modKeyLabel`/`hasPrimaryMod`/`formatModShortcut`，避免两套画布各自硬编码 Ctrl。
- 验证：`npx vitest run tests/shared/platform-shortcuts.test.ts tests/smart-canvas/shortcuts.test.ts`。

### 2026-07-13 — 经典画布节点自定义拉伸与小地图同步

- 涉及路径：`frontend/src/features/canvas/core/nodeResize.ts`、`core/state.ts`、`components/LegacyNodeCard.tsx`、`styles/studio.css`、`DESIGN.md`、相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：全部经典节点右下角可拖拽拉伸/收缩（对齐历史 `.resize-handle`）；尺寸写入文档 `width`/`height` 并标记 `settings.sized`；小地图按实际宽高投影；连接端口仍用 `getBoundingClientRect`。
- 关键决策：最小 220×96；手动定尺寸后停用内容高度 ResizeObserver，避免缩回；PROMPT/图片在定尺寸下 flex 填满。
- 验证：`npx vitest run tests/canvas/node-resize.test.ts tests/canvas/minimap-layout.test.ts`。

### 2026-07-13 — 画布自动保存并移除保存按钮

- 涉及路径：`LegacyCreateToolbar.tsx`、`LegacyCanvasPage.tsx`、`SmartCanvasPage.tsx`、`shared/api/canvasConflict.ts`、工具栏/冲突相关测试、`PROJECT_CONTEXT.md`。
- 行为变化：经典画布去掉手动「保存」按钮；脏状态约 3s debounce 自动 `PUT`；保存中并发改动会排队再存；409 冲突抬升 `baseUpdatedAt` 后重试；失败展示错误（智能画布另 toast），成功静默。智能画布本无保存按钮，同步加固自动保存；`metaKey || ctrlKey` + S（Mac ⌘S / Win Ctrl+S）仍可立即保存。
- 关键决策：对齐历史「本地脏则冲突后重试覆盖」语义，不恢复可见保存按钮。
- 验证：`npx vitest run frontend/tests/canvas/legacy-create-toolbar.test.tsx frontend/tests/smart-canvas/toolbar.test.tsx frontend/tests/shared/canvas-conflict.test.ts`。

### 2026-07-13 — 仓库顶层 assets/ 幂等迁入 DATA_DIR/objects/

- 涉及路径：`backend/storage/legacy_media_migrate.py`、`backend/config.py`（`ensure_data_dirs`）、`backend/tests/unit/test_legacy_media_migrate.py`、`tests/unit/electron/storage-setup.test.js`、`AGENTS.md`、`PROJECT_CONTEXT.md`。
- 行为变化：启动时把仓库根 `assets/`（及 `output/`）中缺失于目标的文件复制到 `DATA_DIR/objects/`（及 `DATA_DIR/output/`）；目标已有文件不覆盖；源目录保留为 `LEGACY_*` 只读回退。本机已复制 18 个媒体文件（input/output）。
- 关键决策：不改 `/assets/...` URL；与 Electron `copyMissing(appDir/assets → objects)` 语义一致，避免开发态仅依赖 legacy 回退。
- 验证：`pytest backend/tests/unit/test_legacy_media_migrate.py backend/tests/unit/test_storage_root_paths.py -q`；`node --test tests/unit/electron/storage-setup.test.js`。

### 2026-07-13 — 统一可写数据根对齐设置「存储」页

- 涉及路径：`backend/config.py`、`routers/object_assets.py`、`services/media_paths.py`、`storage/backup_service.py`、`electron/storage-setup.js`、`electron/main.js`、`AGENTS.md`、相关单元测试、`PROJECT_CONTEXT.md`。
- 行为变化：`ASSETS_DIR` 默认别名 `DATA_DIR/objects`，`OUTPUT_DIR` 默认 `DATA_DIR/output`；设置页「数据目录」成为唯一可写根。Electron 布局改为所选目录即 `DATA_DIR`，并静默把旧版 `storage/{data,objects,exports}` 兄弟布局收拢进 `data/`。启动各打一次路径日志。`AGENTS.md` 新增强制约束，禁止再拆顶层平行写入根。
- 关键决策：不以平行 `STORAGE_ROOT` 覆盖设置页；以 `/api/storage/stats` 的 `data_dir` 为用户真相。仓库顶层 `assets/` 保留为 `LEGACY_ASSETS_DIR` 只读回退。
- 验证：`node --test tests/unit/electron/storage-setup.test.js`；`pytest backend/tests/unit/test_storage_root_paths.py backend/tests/unit/test_storage_ops.py -q`。

### 2026-07-13 — LLM 来自连线输入框置灰

- 涉及路径：`GeneratorNodeBody.tsx`、`generator-node-body.test.tsx`、`PROJECT_CONTEXT.md`。
- 行为变化：`INPUT (来自连线)` 只读时使用历史同款灰底 `#f8fafc` + slate 文字，不再像可编辑白底输入框。
- 关键决策：显式按 `fromWire` 切换 class，避免 `bg-[#fbfdff]` 盖住 `read-only:` 变体。
- 验证：`npx vitest run tests/canvas/generator-node-body.test.tsx`。

### 2026-07-13 — 修复 PROMPT→LLM 输入不同步

- 涉及路径：`frontend/src/features/canvas/core/{nodeSources,types}.ts`、`LegacyNodeCard.tsx`、`LegacyCanvasPage.tsx`、`frontend/tests/canvas/node-generation.test.ts`、`PROJECT_CONTEXT.md`。
- 行为变化：`collectLlmInput` / 生成源读取提示词时，空的 `settings.text` 不再盖住 `node.prompt`；编辑/套用模板同时写回 `settings.text`；加载兼容历史 `text` 字段。
- 关键决策：根因是 `defaultSettingsForKind("prompt")` 种子 `{ text: "" }` 与 `??` 组合；图片路径不受影响故绿条正常。
- 验证：`npx vitest run tests/canvas/node-generation.test.ts`。

### 2026-07-13 — 恢复经典画布连线上游数据同步

- 涉及路径：`frontend/src/features/canvas/core/nodeSources.ts`、`runNodeGeneration.ts`、`components/{GeneratorNodeBody,LegacyNodeCard,ConnectedInputsSummary}.tsx`、canvas i18n、`frontend/tests/canvas/node-generation.test.ts`、`PROJECT_CONTEXT.md`。
- 行为变化：LLM 显示 `INPUT (来自连线)`、媒体绿条与 Output；API/生成节点经 LLM 边透传上游提示词与图片缩略图/文件名；图片源名称优先用素材文件名。
- 关键决策：对齐历史 `llmInputText` / `llmInputImages`；LLM→生成边在无 `outputText` 时透传上游，有输出时优先 `outputText`。
- 验证：`npx vitest run tests/canvas/node-generation.test.ts tests/canvas/generator-node-body.test.tsx`。

### 2026-07-13 — 修复经典画布端口与连线错位

- 涉及路径：`frontend/src/features/canvas/core/layout.ts`、`components/ConnectionLayer.tsx`、`frontend/tests/canvas/layout-extended.test.ts`、`PROJECT_CONTEXT.md`。
- 行为变化：连线端点改为按端口 `getBoundingClientRect` 视觉中心（含 `translateY(-50%)`）；SVG 由直线改为历史同款水平三次贝塞尔曲线。
- 关键决策：根因是 `offsetTop + height/2` 忽略 CSS transform，导致绿线比圆形端口低约半个命中盒；对齐 `history/static/js/canvas.js` 的 `portPoint` / `pathEl`。
- 验证：`npx vitest run frontend/tests/canvas/layout-extended.test.ts`。

### 2026-07-13 — 素材库管理五 Tab 三栏对齐 + 提示词双向同步

- 涉及路径：`frontend/src/features/asset-manager/{AssetManagerPage,PromptLibrariesBrowser,WorkflowsBrowser,CanvasAssetsBrowser}.tsx`、`LegacyPromptTemplateModal`/`promptTemplates.ts`、`studio.css`、assets/canvas i18n、`frontend/tests/asset-manager/`、`DESIGN.md`、`PROJECT_CONTEXT.md`。
- 行为变化：五 Tab 统一三栏壳；提示词库左树展示系统库→全部/视角/…/我的计数，中栏列表、右栏正/负向预览；与画布模板库共享 `["prompt-libraries"]` + `/api/prompt-libraries`，画布「新模板」出现在「我的」。
- 关键决策：以历史 `history/static/js/asset-manager.js` 交互为源；修正原先误读 `libraries` 根字段且只列库名的同步断点。
- 验证：`npx vitest run frontend/tests/asset-manager/ frontend/tests/canvas/prompt-templates.test.ts frontend/tests/canvas/legacy-prompt-template-modal.test.tsx`。

### 2026-07-13 — 素材库图片/本地素材改为三栏布局

- 涉及路径：`frontend/src/features/asset-manager/{AssetManagerPage,AssetBrowserChrome,ImageAssetsBrowser,LocalMediaBrowser}.tsx`、`frontend/src/styles/studio.css`、`frontend/src/shared/i18n/locales/{en,zh}/assets.json`、`frontend/tests/asset-manager/asset-manager.test.tsx`、`DESIGN.md`、`PROJECT_CONTEXT.md`。
- 行为变化：「图片资产」「本地素材」对齐历史提示词库式三栏（左树/中列表/右预览）；上传与批量管理移入中栏；AI 标注工具栏仍在页头。
- 关键决策：复用历史 asset-manager 三栏交互与现有 asset-library API，不另起视觉体系；工作流/提示词/画布资产暂保持原布局。
- 验证：`npx vitest run frontend/tests/asset-manager/`。

### 2026-07-13 — 修复经典画布 PROMPT 模板库空占位

- 涉及路径：`frontend/src/features/canvas/components/LegacyPromptTemplateModal.tsx`、`core/promptTemplates.ts`、`LegacyCanvasPage.tsx`、`smart-canvas/components/PromptLibraryPanel.tsx`、`shared/api/client.ts`、`types/api.d.ts`、canvas/common i18n、`frontend/tests/canvas/prompt-templates.test.ts`、`legacy-prompt-template-modal.test.tsx`、`PROJECT_CONTEXT.md`。
- 行为变化：模板库改为右侧分栏面板；从 `/api/prompt-libraries` 加载真实 `name`/`positive` 模板；支持库选择、搜索、分类计数、详情与「正向/完整应用」；可选存当前/新模板/编辑删除/管理分组。
- 关键决策：空条根因是误用 `title`/`content` 字段且走错数据源；对齐历史侧栏交互并复用提示词库 API。
- 验证：`npx vitest run frontend/tests/canvas/prompt-templates.test.ts frontend/tests/canvas/legacy-prompt-template-modal.test.tsx`。

### 2026-07-13 — 修复小地图视口框跟随平移缩放

- 涉及路径：`frontend/src/features/canvas/core/minimapLayout.ts`、`components/Minimap.tsx`、`smart-canvas/components/Minimap.tsx`、`frontend/tests/canvas/minimap-layout.test.ts`、`PROJECT_CONTEXT.md`。
- 行为变化：小地图 bounds 纳入当前世界视口（对齐历史 `minimapBounds`），视口框随平移/缩放更新且保持在地图内可见。
- 关键决策：抽出共享投影公式；视口框最小 8px 并加半透明填充。
- 验证：`npm test -w frontend -- --run tests/canvas/minimap-layout.test.ts`。

### 2026-07-13 — 修复小地图节点为扁平条

- 涉及路径：`frontend/src/features/canvas/components/Minimap.tsx`、`frontend/src/features/smart-canvas/components/Minimap.tsx`、`PROJECT_CONTEXT.md`。
- 行为变化：小地图节点高度由硬编码 `4` 改为按真实 `height * scale` 绘制（最小 3px），与历史 minimap 比例一致。
- 关键决策：经典/智能画布两处同步修复；宽度同样加最小 3px 下限。
- 验证：静态核对两处 Minimap 不再使用 `height={4}`。

### 2026-07-13 — 建立字体与 UI 设计规范

- 涉及路径：`AGENTS.md`、`DESIGN.md`、`PROJECT_CONTEXT.md`。
- 行为变化：UI 开发前必须阅读设计规范；新增视觉模式或 Token 时必须同步更新规范。
- 关键决策：沿用工业化创作工作台方向，以现有主题变量、品牌字体和共享 UI 组件为唯一实现基线。
- 验证：运行 `git diff --check -- AGENTS.md DESIGN.md PROJECT_CONTEXT.md`。

### 2026-07-13 — 经典画布：工具栏默认折叠与 IMAGE/PROMPT 节点对齐历史

- 涉及路径：`frontend/src/features/canvas/components/LegacyCreateToolbar.tsx`、`LegacyNodeCard.tsx`、`frontend/tests/canvas/legacy-create-toolbar.test.tsx`、`PROJECT_CONTEXT.md`。
- 行为变化：快捷创建工具栏默认折叠（仅展开箭头 + 工作流/资产库/日志）；空 IMAGE 节点虚线上传区支持点击与拖拽，文案对齐历史；PROMPT 节点增加「模板库」行、`0 / 20,000` 字数统计与方形大文本框。
- 关键决策：字数上限沿用历史 `PROMPT_TEXT_MAX_LENGTH = 20000`；左侧画布导航保持常显（历史亦未默认折叠）。
- 验证：`npx vitest run frontend/tests/canvas/legacy-create-toolbar.test.tsx`。

### 2026-07-13 — 建立项目上下文维护机制

- 涉及路径：`AGENTS.md`、`PROJECT_CONTEXT.md`。
- 行为变化：规定所有代码变更必须同步更新本文件，并在开发前读取项目上下文。
- 关键决策：以 `PROJECT_CONTEXT.md` 作为唯一的长期项目上下文入口。
- 验证：运行 `git diff --check -- AGENTS.md PROJECT_CONTEXT.md`。

<!--
新增记录模板：
### YYYY-MM-DD — 变更主题
- 涉及路径：
- 行为变化：
- 关键决策：
- 验证：
-->
