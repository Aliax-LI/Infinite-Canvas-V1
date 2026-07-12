# 桌面端本地数据库与对象存储改造评估

## 结论

改造可行，推荐分两步实施：

1. **先将结构化数据迁移到 SQLite，并建立统一的对象存储接口。**
2. **媒体默认使用本地文件对象仓库；MinIO 作为可选后端，而不是桌面版的强制依赖。**

当前应用是单用户、单机、单后端进程，SQLite 与这个运行模型非常匹配。MinIO 也能随桌面应用运行，但会额外引入约一个后台服务的安装、进程守护、端口、凭据、健康检查、升级和备份问题。如果现阶段没有 S3 API、跨设备访问或外部程序共享对象的硬需求，直接强制内嵌 MinIO 的收益不足以覆盖复杂度。

综合可行性：**高（8/10）**。主要工作量不在数据库本身，而在现有业务代码大量直接操作 JSON 和文件路径，需要先收口读写边界。

## 当前存储现状

> **清理后布局快照**（2026-07-12）：见 [DATA_DIRECTORY_LAYOUT.md](./DATA_DIRECTORY_LAYOUT.md)。  
> 当前开发环境运行在 **JSON 模式**；`data/objects/output/` 保留 8 张真实生成图，测试会话与孤立 SQLite 测试库已移除。

结构化数据目前分散在：

- `data/projects.json`
- `data/canvases/*.json`
- `data/conversations/<user>/*.json`
- `data/asset_library.json`
- `data/prompt_libraries.json`
- `data/api_providers.json`
- `data/shared_folders.json`
- `data/runninghub_workflows.json`
- `history.json`
- `workflows/` 下的用户工作流

媒体和产物目前直接写入：

- `assets/input`
- `assets/output`
- `assets/library`
- `assets/uploads`
- `output/`
- `data/media_previews`

风险主要有：并发写 JSON 时缺少事务、跨文件关系难以保持一致、全量加载与扫描会随数据量增长、升级/卸载时用户数据与运行文件边界不够清晰。

## 推荐目标架构

```text
Electron
  ├─ 管理首次启动与本地数据目录
  ├─ 启动/停止 FastAPI
  └─ 可选：启动/停止 MinIO（仅高级模式）

FastAPI
  ├─ Repository 层
  │   └─ SQLite: 项目、画布、会话、素材元数据、任务、配置索引
  └─ ObjectStore 层
      ├─ LocalObjectStore（桌面默认）
      └─ S3ObjectStore（MinIO，可选）
```

建议的本地目录布局：

```text
storage/
  data/
    infinite-canvas.db
    migrations/
  objects/
    input/
    output/
    library/
    uploads/
  exports/
  workflows/
  config/
    api.env
  minio/                 # 仅启用 MinIO 时使用
```

数据库只保存对象键、哈希、MIME、尺寸、大小、创建时间和业务关系，不把图片/视频 BLOB 写进 SQLite。

## SQLite 设计建议

第一批表建议包括：

- `projects`
- `canvases`
- `conversations`、`messages`、`attachments`
- `assets`、`asset_categories`、`asset_tags`
- `generation_jobs`、`generation_outputs`
- `prompt_libraries`、`prompts`
- `api_providers`
- `app_secrets`（API Key / RunningHub wallet / Volcengine AK·SK 等）
- `shared_folders`
- `workflow_metadata`
- `schema_migrations`

关键约束：

- 开启 WAL、foreign keys 和 busy timeout。
- **API Key 等敏感值**写入独立表 `app_secrets`（SQLite）或 `data/app_secrets.json`（JSON 模式）；不写入 provider 文档，列表接口只返回 `has_key` / `key_preview`。
- 启动时会从遗留 `config/api.env`（或 `API/.env`）**一次性导入**尚未入库的密钥；之后设置页保存不再把密钥写回 env 文件（env 仅作可选覆盖 / 非密钥配置如 Comfy 模型列表）。
- 所有 schema 变更必须走版本化 migration。
- 迁移前自动生成 JSON 清单和数据库备份；失败时回滚并继续使用旧数据。
- JSON 导入应可重复执行，通过稳定 ID 或内容哈希避免重复数据。

## MinIO 的适用条件

满足以下任一条件时，MinIO 值得启用：

- 已有业务代码必须使用 S3 API。
- 需要让其他本地程序通过标准对象协议访问产物。
- 近期明确要做局域网、多设备或服务端部署，并希望桌面端与服务端共用存储实现。

如果内嵌 MinIO，需要同时完成：

- 二进制按 Windows/macOS 架构打包与校验。
- 仅绑定 `127.0.0.1`，动态选择 API/Console 端口。
- 首次启动生成随机访问凭据，不写入日志或前端 localStorage。
- Electron 负责健康检查、异常重启、优雅退出和孤儿进程清理。
- 数据目录与 MinIO 二进制分离，升级只替换程序，不触碰对象数据。
- 备份时协调 SQLite checkpoint 与对象目录快照，避免元数据和对象不一致。
- MinIO 不可用时给出可操作的修复、重试与降级提示。

因此推荐默认使用 `LocalObjectStore`，同时保证接口与 S3 语义兼容。这样以后启用 MinIO 只新增适配器和进程管理，不重写生成、素材和画布业务。

## 分阶段实施

### 阶段 0：数据目录解耦（本次已完成基础）

- 首次启动确认本地数据目录。
- 检查可写性和剩余空间。
- 运行数据不再依赖安装目录或版本化运行目录。
- 升级与卸载默认保留用户数据。
- 旧目录内容仅复制缺失项，不覆盖用户文件。

### 阶段 1：Repository 与 SQLite

- 建立数据库连接、migration 和 repository 接口。
- 优先迁移项目、画布、会话、素材元数据。
- 保留一次性 JSON importer 和导出工具。
- 对所有写操作增加事务和集成测试。

### 阶段 2：ObjectStore 收口

- 将上传、下载、预览、生成结果和素材库的直接路径访问替换为对象键。
- 实现 `LocalObjectStore`。
- 数据库记录对象哈希与引用计数，支持去重和安全清理。

### 阶段 3：可选 MinIO

- 实现 `S3ObjectStore` 和 Electron MinIO supervisor。
- 在高级设置中启用，不影响默认安装路径。
- 增加端口冲突、进程崩溃、磁盘满、凭据损坏和升级回滚测试。

## 粗略工作量

在保持现有 API 基本不变、由一名熟悉项目的开发者实施的前提下：

- 阶段 0：1–2 人日
- 阶段 1：5–8 人日
- 阶段 2：4–7 人日
- 阶段 3（MinIO）：4–6 人日
- 数据迁移、回归与安装包验证：3–5 人日

总计约 **17–28 人日**。如果只做 SQLite + 本地对象仓库，不内嵌 MinIO，约 **13–22 人日**。

## 验收标准

- 断网状态可安装、启动并读写既有数据（首次下载依赖的现状需另行做离线包）。
- 应用升级后项目、设置、图片和视频完整保留。
- 卸载再安装后可以重新关联原数据目录。
- JSON 迁移失败不会破坏源文件，可一键重试。
- 数据库与对象引用一致，无悬挂对象或失效素材 URL。
- Windows/macOS 均覆盖路径包含中文、空格、只读目录、磁盘不足和端口占用场景。

