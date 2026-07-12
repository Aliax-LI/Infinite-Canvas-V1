# 本地存储改造进度

> 执行计划真源：`plan.md`  
> 架构参考：`docs/LOCAL_STORAGE_ARCHITECTURE.md`  
> 最后更新：2026-07-11 01:31

## Loop 配置

- **状态**：✅ **已停止**（后端计划项完成，2026-07-11 closeout）

---

## 里程碑总览

| 里程碑 | 阶段 | 状态 |
|--------|------|------|
| M0 本地数据目录 | Phase 0 | ✅ |
| M1 SQLite 可用 | Phase 1–3 | ✅ |
| M2 本地对象仓库 | Phase 4 | ✅ 后端 |
| M3 桌面数据闭环 | Phase 6–7 | ✅ 后端 API + 设置页 UI |
| M4 可选 MinIO | Phase 5 | ⏸ 跳过 |

---

## 后端验收报告（2026-07-11）

### 交付物索引

| 域 | 关键路径 |
|----|----------|
| Repository 收口 | `backend/repositories/`（json + sqlite + factory） |
| SQLite | `database.py`, `migration_runner.py`, `migrations/001_*.sql` |
| JSON 迁移 | `json_to_sqlite.py`, `migration_manifest.py`, `POST /api/storage/migrate` |
| ObjectStore | `local_object_store.py`, `object_store_factory.py`, `object_store_media.py` |
| 静态资源 | `routers/object_assets.py` → `GET /assets/*` |
| 运维 | `backup_service.py`, `orphan_scanner.py`, `/api/storage/{stats,backup,backups,restore,orphans}` |
| 设置页 UI | `frontend/src/features/settings/storage/StorageSettingsPage.tsx` |
| Electron | `desktop:open-path` → 打开数据目录 |

### plan.md 退出标准核对

| 标准 | 状态 |
|------|------|
| 结构化数据 SQLite + migration | ✅ |
| legacy JSON 一次性迁移 + 回滚 | ✅ |
| 媒体经 ObjectStore 抽象读写 | ✅（input/uploads/output/library） |
| `/assets` URL 兼容 | ✅ |
| 备份含 DB + objects | ✅ |
| 孤立对象可扫描 | ✅ |
| MinIO / S3 | ⏸ 未做（计划可选） |
| 设置页 / Electron 恢复 UI | ✅ |

### 测试

```
unit + integration   227/227 passed（closeout 复验）
```

---

## Loop 执行记录

| 轮次 | 时间 | 内容 |
|------|------|------|
| P2-4 | 00:42 | Phase 2 验收 |
| P3-0 | 01:05 | JSON→SQLite 迁移器 |
| P4-1 | 01:12 | upload → ObjectStore |
| P4-2 | 01:18 | output + `/assets` 路由 |
| P4-3 | 01:25 | library + orphan + backup API |
| **UI** | 01:31 | 设置页存储 Tab + 备份/恢复 + Electron open-path |

---

## 后续（非 Loop 范围）

1. ~~**前端/Electron**：设置页接 `/api/storage/stats`、备份按钮、从备份恢复~~ ✅
2. **可选**：`POST /api/storage/cleanup-orphans`（dry-run 默认）
3. **产品确认后**：Phase 5 MinIO
4. ✅ **API 密钥入库**（2026-07-11）：`app_secrets` 表 / `data/app_secrets.json`；设置页不再写密钥到 `api.env`；启动时从遗留 env 一次性导入
