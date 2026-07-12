# 无限画布桌面端本地存储改造实施计划

## 1. 文档目的

本文是将无限画布桌面端改造为“结构化数据本地数据库化、图片视频等产物本地对象化、安装和升级过程可控”的执行计划。

目标不是一次性替换所有读写逻辑，而是在不破坏现有项目数据和 API 的前提下，分阶段完成：

1. 用户数据与程序安装目录彻底解耦。
2. 结构化数据从 JSON 文件迁移到 SQLite。
3. 媒体读写收口到统一 `ObjectStore` 接口。
4. 桌面默认使用本地文件对象仓库。
5. 在确有 S3 需求时启用本地 MinIO。
6. 安装、升级、备份、回滚和卸载均有明确的数据保护策略。

## 2. 已确认的架构决策

### 2.1 结构化数据使用 SQLite

原因：

- 当前是单用户、单机、单 FastAPI 后端进程。
- SQLite 无需额外数据库服务，适合随桌面应用分发。
- 支持事务、索引、外键和可靠 migration。
- 备份和恢复可以围绕单数据库文件组织。

SQLite 不保存图片或视频 BLOB，只保存对象键、文件信息和业务关系。

### 2.2 媒体使用对象存储抽象

业务层只依赖以下能力：

```python
class ObjectStore:
    def put(self, source, *, content_type, metadata) -> StoredObject: ...
    def open(self, object_key): ...
    def exists(self, object_key) -> bool: ...
    def delete(self, object_key) -> None: ...
    def copy(self, source_key, target_key) -> StoredObject: ...
    def resolve_url(self, object_key, *, expires_in=None) -> str: ...
```

第一实现为 `LocalObjectStore`，后续可新增 `S3ObjectStore` 对接 MinIO。

### 2.3 MinIO 不是默认强制依赖

默认桌面安装使用本地文件对象仓库。满足以下条件时再启用 MinIO：

- 业务代码或外部工具必须使用 S3 API。
- 需要让其他程序访问对象。
- 需要与服务端部署复用同一对象接口。
- 计划支持局域网或多设备访问。

MinIO 必须通过高级设置显式启用，不能影响不需要 S3 的普通用户。

## 3. 目标目录结构

```text
storage/
  data/
    infinite-canvas.db
    migrations/
    backups/
  objects/
    input/
    output/
    library/
    uploads/
    previews/
  exports/
  workflows/
  config/
    api.env
    storage.json
  logs/
  minio/
    data/
    config/
```

约束：

- 程序更新只能替换应用文件，不能覆盖 `storage/`。
- 用户可在首次启动时选择数据目录。
- 所有路径均支持中文、空格和非系统盘。
- 不允许把数据目录放入程序安装目录。
- 卸载默认保留数据。

## 4. 数据库模型草案

### 4.1 核心业务表

| 表 | 用途 | 关键字段 |
|---|---|---|
| `projects` | 项目 | `id`, `name`, `created_at`, `updated_at` |
| `canvases` | 画布元数据 | `id`, `project_id`, `title`, `kind`, `status`, `revision` |
| `canvas_documents` | 画布内容快照 | `canvas_id`, `document_json`, `updated_at` |
| `conversations` | 会话 | `id`, `project_id`, `title`, `provider_id` |
| `messages` | 对话消息 | `id`, `conversation_id`, `role`, `content`, `created_at` |
| `attachments` | 消息附件 | `id`, `message_id`, `asset_id`, `sort_order` |
| `assets` | 素材元数据 | `id`, `object_key`, `sha256`, `mime_type`, `size_bytes` |
| `asset_categories` | 素材分类 | `id`, `name`, `sort_order` |
| `asset_tags` | 素材标签 | `id`, `name` |
| `asset_tag_links` | 素材与标签关系 | `asset_id`, `tag_id` |
| `generation_jobs` | 生成任务 | `id`, `provider_id`, `status`, `request_json` |
| `generation_outputs` | 生成产物 | `job_id`, `asset_id`, `sort_order` |
| `api_providers` | 服务商配置 | `id`, `protocol`, `base_url`, `config_json` |
| `prompt_libraries` | 提示词库 | `id`, `name` |
| `prompts` | 提示词 | `id`, `library_id`, `title`, `content` |
| `workflows` | 工作流索引 | `id`, `name`, `file_path`, `config_json` |
| `shared_folders` | 共享目录配置 | `id`, `path`, `enabled` |
| `schema_migrations` | 数据库版本 | `version`, `applied_at` |

### 4.2 数据库约束

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- `PRAGMA busy_timeout = 5000`
- 所有写操作进入显式事务。
- 列表和搜索字段建立索引。
- 删除项目、画布和素材使用软删除或回收站状态。
- 数据库 migration 只能向前执行，回滚通过备份恢复完成。

### 4.3 敏感信息

- API key 不以明文直接存入普通业务表。
- Windows 使用 Credential Manager，macOS 使用 Keychain。
- 数据库仅保存凭据引用 ID。
- 在系统凭据能力未接入前，保留独立 `config/api.env`，并限制文件权限。

## 5. 分阶段执行计划

## Phase 0：本地数据目录基础

状态：基础已完成。

任务：

- 首次启动显示本地数据目录步骤。
- 支持选择目录。
- 检查目录可写性。
- 显示剩余磁盘空间。
- Windows 默认使用 Local AppData。
- 元数据、对象、导出、工作流和配置路径通过环境变量传给 FastAPI。
- 从旧 `runtime/` 目录复制缺失数据，目标文件已存在时不覆盖。
- 安装向导说明升级和卸载的数据保护策略。

退出标准：

- 首次安装可以选择数据目录并正常进入应用。
- 升级应用后数据目录保持不变。
- 数据目录不可写时无法继续，并显示明确原因。
- Windows NSIS 安装包可完整构建。

预计：1–2 人日。

## Phase 1：存储读写盘点与接口收口

任务：

- 建立所有 JSON 和媒体文件读写点清单。
- 为项目、画布、会话、素材、服务商、提示词和工作流分别定义 Repository 接口。
- 为媒体定义 `ObjectStore` 接口和 `StoredObject` 数据结构。
- 禁止 router 直接操作文件路径。
- 为现有 JSON 实现临时 `JsonRepository`，保持行为不变。
- 给现有 API 增加契约测试，冻结迁移前响应结构。

交付物：

- `backend/repositories/`
- `backend/storage/object_store.py`
- 数据读写清单
- API 契约测试

退出标准：

- router 和主要 service 不再直接 `json.dump` 或拼接素材目录。
- 使用旧 JSON 实现时全部现有测试通过。
- 新增代码只依赖 Repository 和 ObjectStore。

预计：3–5 人日。

## Phase 2：SQLite 基础和 schema migration

任务：

- 建立连接管理、事务上下文和健康检查。
- 建立首版 schema。
- 实现 migration runner。
- 实现项目、画布、会话、素材和服务商 Repository。
- 实现数据库 checkpoint、完整性检查和备份。
- 应用启动时检测 schema 版本。

退出标准：

- 新建用户不再生成主要业务 JSON 文件。
- 多个连续写操作可以通过事务整体成功或失败。
- `PRAGMA integrity_check` 返回 `ok`。
- schema 可从空数据库升级到当前版本。

预计：4–6 人日。

## Phase 3：JSON 到 SQLite 数据迁移

任务：

- 启动迁移前生成源文件清单和 SHA-256。
- 备份全部 JSON 文件。
- 按依赖顺序迁移项目、画布、会话、素材、提示词、服务商和工作流索引。
- 使用稳定 ID 防止重复导入。
- 记录每类数据的读取数、写入数、跳过数和错误数。
- 迁移完成后进行数量和引用一致性校验。
- 迁移失败时恢复数据库备份并继续使用 JSON。
- 保留只读 JSON 导入器，不在成功迁移后继续双写。

迁移顺序：

1. 项目
2. 画布
3. 服务商配置
4. 提示词库
5. 素材分类与素材元数据
6. 会话与消息
7. 工作流索引
8. 历史记录

退出标准：

- 迁移前后实体数量一致。
- 所有画布都能打开。
- 所有素材引用都能解析到有效对象。
- 重复执行 importer 不产生重复记录。
- 任意阶段失败均不修改源 JSON。

预计：3–5 人日。

## Phase 4：LocalObjectStore

任务：

- 实现基于文件系统的对象写入、读取、复制、删除和 URL 解析。
- 对象键不暴露绝对文件路径。
- 新对象使用 UUID 或内容哈希命名。
- 保存 MIME、大小、尺寸、时长、哈希和原始文件名。
- 上传先写临时文件，校验后原子移动到目标位置。
- 建立缩略图和视频预览对象关系。
- 增加引用计数和孤立对象扫描工具。
- 将上传、生成、素材库、预览和下载服务迁移到 ObjectStore。

退出标准：

- 业务层不再依赖 `assets/input` 等固定路径。
- 同名上传不会覆盖已有对象。
- 写入中断不会留下被数据库引用的半文件。
- 删除正在被画布或会话引用的素材会被拒绝或进入回收站。

预计：4–7 人日。

## Phase 5：可选 MinIO 与 S3ObjectStore

前置条件：产品确认确实需要 S3 兼容服务。

任务：

- 按 Windows x64、macOS x64、macOS arm64 打包 MinIO 二进制。
- 构建二进制校验和清单。
- Electron 生成随机访问凭据并存入系统凭据库。
- MinIO 只绑定 `127.0.0.1`。
- 动态选择 API 和 Console 端口。
- Electron 管理启动、健康检查、异常重启和优雅退出。
- 实现 `S3ObjectStore`。
- 自动创建私有 bucket，不允许匿名访问。
- 前端不直接持有长期 MinIO 密钥。
- 提供本地文件后端与 MinIO 后端之间的迁移命令。

失败策略：

- MinIO 启动失败时不自动创建新的空存储。
- 数据仍在时允许重试、修复或切回 LocalObjectStore。
- 端口冲突时自动重新选择端口。
- 凭据损坏时要求用户确认后重新生成。
- 进程崩溃后最多按退避策略重启，避免无限重启。

退出标准：

- MinIO 关闭时默认桌面模式不受影响。
- MinIO 模式下上传、生成、预览、下载和删除全部通过 S3ObjectStore。
- 无服务监听在 `0.0.0.0`。
- 任务管理器中不存在退出应用后的孤儿 MinIO 进程。

预计：4–6 人日。

## Phase 6：安装、升级、备份和恢复

任务：

- 首次启动展示数据目录、空间和隐私说明。
- 已配置用户升级时跳过数据目录步骤。
- 数据库 migration 前自动备份。
- 备份时执行 WAL checkpoint。
- 备份包含数据库、对象清单、工作流和配置，不包含可重新生成的缓存。
- 提供“打开数据目录”“立即备份”“从备份恢复”。
- 恢复前自动备份当前状态。
- 卸载程序明确提示数据默认保留。
- 支持重新安装后选择已有数据目录。

退出标准：

- 升级失败可重新安装旧版本并恢复最近备份。
- 备份恢复后数据库引用与对象清单一致。
- 卸载应用不会删除用户数据。

预计：3–5 人日。

## Phase 7：设置页和运维能力

任务：

- 设置页显示当前数据目录、数据库大小、对象数量和占用空间。
- 显示存储后端类型：本地文件或 MinIO。
- 提供存储健康检查。
- 提供对象引用扫描和安全清理。
- 提供日志导出，默认脱敏路径、凭据和请求参数。
- 数据目录迁移必须采用“复制 → 校验 → 切换”，不能直接移动。

退出标准：

- 用户能判断数据保存在哪里、占用多少空间、是否健康。
- 数据迁移中断后仍使用原目录。
- 清理功能不会删除仍被引用的对象。

预计：2–4 人日。

## 6. 安装向导详细流程

### Step 1：本地存储

- 解释项目、设置、图片和视频只保存在本机。
- 显示默认数据目录。
- 允许选择其他目录。
- 显示可用空间。
- 少于 10 GB 时提示风险，但允许用户确认继续。
- 目录不可写、位于安装目录或路径无效时阻止继续。

### Step 2：运行环境

- 检测应用专用 Python。
- 缺失时自动下载安装。
- 创建隔离环境并安装依赖。
- 日志中显示当前阶段，不显示凭据和敏感路径参数。

### Step 3：可选 CLI

- 标明推荐和可选工具。
- 已安装工具直接显示状态。
- 支持失败重试。
- 允许跳过并稍后在设置中配置。

### Step 4：启动检查

- 检查数据库或 JSON 存储。
- 检查对象仓库。
- 可选检查 MinIO。
- 启动 FastAPI 并等待健康检查。
- 成功后打开主窗口。

## 7. 测试计划

### 7.1 单元测试

- SQLite Repository CRUD 和事务回滚。
- migration 版本升级。
- JSON importer 幂等性。
- ObjectStore 对象键、原子写入和路径安全。
- MinIO 端口和凭据配置。
- 数据目录校验、空间检查和状态持久化。

### 7.2 集成测试

- API 在 SQLite 下保持响应兼容。
- 上传 → 素材入库 → 画布引用 → 删除保护。
- 生成任务 → 产物入库 → 预览 → 导出。
- 数据库事务失败时不留下无主引用。
- 对象写入失败时不提交数据库记录。

### 7.3 迁移测试矩阵

- 空用户目录。
- 仅有项目和画布。
- 大量会话和附件。
- 中文文件名和深层目录。
- JSON 损坏或部分字段缺失。
- 目标数据库已有部分数据。
- 迁移中途强制退出。
- 磁盘空间不足。

### 7.4 桌面端测试矩阵

| 平台 | 安装 | 首启 | 升级 | 卸载保留 | 数据恢复 |
|---|---:|---:|---:|---:|---:|
| Windows x64 | 必测 | 必测 | 必测 | 必测 | 必测 |
| macOS arm64 | 必测 | 必测 | 必测 | 必测 | 必测 |
| macOS x64 | 必测 | 必测 | 必测 | 必测 | 必测 |

### 7.5 故障注入

- 数据目录只读。
- 磁盘写满。
- 数据库被占用。
- SQLite 文件损坏。
- MinIO 端口被占用。
- MinIO 进程被终止。
- 对象文件被手动删除。
- 应用在 migration 中强制退出。

## 8. 发布和回滚策略

### 8.1 发布顺序

1. 内部开发数据测试。
2. 自动化迁移样本测试。
3. Windows/macOS 安装包测试。
4. 小范围 beta，默认 LocalObjectStore。
5. 观察迁移失败率和恢复成功率。
6. 正式发布 SQLite + LocalObjectStore。
7. MinIO 作为独立 beta 功能开放。

### 8.2 回滚

- migration 前始终保留数据库和 JSON 备份。
- 新版失败时可切回旧版和旧 JSON。
- 不在首个 SQLite 版本中自动删除 JSON。
- 连续两个稳定版本后，才考虑提供手动清理旧 JSON 的入口。
- 对象存储切换前后保留清单和校验报告。

## 9. 风险清单

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| JSON 数据形态不一致 | 高 | 宽容 importer、错误隔离、迁移报告 |
| 数据库与对象不一致 | 高 | 事务边界、临时对象、引用扫描 |
| MinIO 增加安装和进程复杂度 | 高 | 默认关闭、独立 supervisor、健康检查 |
| 升级误覆盖数据 | 高 | 数据目录解耦、缺失复制、升级测试 |
| 磁盘被视频快速占满 | 中 | 空间提示、占用统计、安全清理 |
| 杀毒软件锁定 exe 或对象 | 中 | 文件重试、原子写入、明确错误提示 |
| 凭据泄漏 | 高 | 系统凭据库、日志脱敏、仅绑定本机 |
| macOS 签名与二进制兼容 | 中 | 分架构打包、签名、公证、安装验证 |

## 10. 里程碑与工作量

| 里程碑 | 包含阶段 | 预计人日 | 可交付结果 |
|---|---|---:|---|
| M0 本地数据目录 | Phase 0 | 1–2 | 安装和升级数据基础 |
| M1 SQLite 可用 | Phase 1–3 | 10–16 | 结构化数据完成数据库化 |
| M2 本地对象仓库 | Phase 4 | 4–7 | 媒体读写完成接口化 |
| M3 桌面数据闭环 | Phase 6–7 | 5–9 | 备份、恢复、设置和清理 |
| M4 可选 MinIO | Phase 5 | 4–6 | S3 兼容本地对象服务 |

总工作量：

- SQLite + LocalObjectStore + 安装与恢复：约 20–34 人日。
- 再增加可选 MinIO：约 24–40 人日。

估算包含开发、迁移脚本、测试和安装包验证，不包含代码签名申请、产品文案评审和大规模真实用户数据修复。

## 11. 推荐执行顺序

下一迭代只进入 M1：

1. 完成数据读写盘点。
2. 建立 Repository 接口。
3. 冻结现有 API 契约。
4. 建立 SQLite schema 与 migration runner。
5. 优先迁移项目、画布和会话。

在 M1 验收前，不开始 MinIO 二进制打包。这样能先解决 JSON 事务和数据一致性问题，同时避免数据库迁移与后台对象服务两个高风险改动并行发生。

