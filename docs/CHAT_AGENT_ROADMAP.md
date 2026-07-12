# Chat Agent 模式：现状与优化路线

> **文档性质**：规划备忘，非实施计划。  
> **更新日期**：2026-07-11

---

## 当前优先级

| 优先级 | 事项 | 说明 |
|--------|------|------|
| **P0（现在）** | 修复各页面功能、稳定主流程 | 画布 / 设置 / 媒体 / 聊天基础能力等 |
| **P1（暂缓）** | Agent 深度优化 | 本文档记录方向，**不排期、不实现** |

Agent 相关改动仅在「各页面功能稳定」之后再评估。本文档供日后决策，不构成当前 Sprint 任务。

---

## 一句话定位

今日的 Chat **Agent** 模式 = **轻量意图路由器**：用一次 LLM（或启发式）决定走「纯聊天」还是「生图/改图」，再调用已有能力。  
**不是**可规划、可多步工具调用、可记忆策略的真正 Agent。

---

## 当前行为与架构

### 前端

| 项 | 说明 |
|----|------|
| 模式枚举 | `chat` \| `agent` \| `image`（`frontend/src/features/chat/types.ts`） |
| Agent 请求 | `POST /api/chat/agent`（非 SSE；`stream.ts` 用普通 `api.post`） |
| Chat 流式 | `POST /api/chat/stream`（仅普通聊天模式） |
| Image 模式 | `POST /api/chat`（直接生图，不经 Agent 决策） |
| UI | Agent 下可切换聊天模型 / 图像模型选择器；等待文案「正在判断并调用合适的工具...」 |
| 图片气泡文案 | 有 `agent_reply` 则显示，否则用「已生成」类占位 |

### 后端入口

- 路由：`backend/routers/generate.py` → `POST /api/chat/agent`
- 实现：`backend/services/chat_service.py` → `chat_agent_endpoint`

### 决策流水线

```
用户消息 + 参考图 + 会话历史
        ↓
decide_chat_agent_action()
  ├─ Codex / Gemini CLI：跳过上游 JSON，直接启发式
  └─ 其它：chat/completions 意图路由（要求返回 JSON）
        ↓
parse_agent_decision()（解析失败 / 弱模型 → 启发式纠偏）
        ↓
action ∈ { chat | generate_image | edit_image }
        ↓
  chat            → build_chat_text_reply（同步文本）
  generate_image  → generate_ai_image（可多张并行提示拆分）
  edit_image      → 同上，带参考图；无参考则回退 generate_image
```

### 三种 action

| action | 含义 | 执行 |
|--------|------|------|
| `chat` | 普通问答 | 聊天模型文本回复 |
| `generate_image` | 新建图片 | 图像 Provider + `image_model` |
| `edit_image` | 基于参考图 / 上一张图修改 | 参考图缺失时降级为 `generate_image` |

启发式关键词见 `AGENT_IMAGE_KEYWORDS` / `AGENT_EDIT_KEYWORDS`；强生图意图纠偏见 `AGENT_STRONG_GENERATE_RE`（如「绘制」）。

### 与其它模式的关系

```
chat  ──SSE──► 纯文本流式
image ─POST──► 直接生图（用户显式选图模）
agent ─POST──► 先路由，再 chat 或 生图/改图
```

三者共用对话存储与部分生图工具链；Agent **没有**独立工具注册表、规划循环或会话级策略层。

---

## 今天「不是」什么

- 不是多步 ReAct / 规划–执行循环  
- 不是可扩展工具平台（无画布操作、无工作流、无文件/检索工具）  
- 不是流式 Agent（决策 + 生图整段阻塞，前端一次性拿回 conversation）  
- 不是与 Image 模式对等的产品深度：Image 是显式生图；Agent 只是「猜该不该生图」  
- 不是独立 Agent 产品线：当前是 Chat 页上的第三个开关

---

## 近期已修问题（上下文）

供路线图对照，非待办清单：

1. **「绘制」等词空回复 / 误走 chat**  
   - 部分思考模型 `content` 为空，或弱路由把明确画图意图判成 `chat`。  
   - 已加强：`text_from_chat_response` 兼容 reasoning 字段；「绘制」等列入关键词与 `AGENT_STRONG_GENERATE_RE`；LLM 误判 `chat` 时可被启发式抬升为 `generate_image`。  
   - 单测：`backend/tests/unit/test_chat_agent_decision.py`。

2. **流式 / 等待 UX**  
   - 普通 chat 有 SSE + pending/thinking 气泡。  
   - Agent / Image 为一次性 POST；前端用 pending +「正在判断并调用合适的工具...」降低「卡住」感，**并非**真正 token 流式。

---

## 未来优化选项（仅规划）

决策时二选一或分阶段，**当前不排期**。

### 方向 A：简化 / 合并进 Chat

| 思路 | 价值 | 代价 |
|------|------|------|
| 去掉独立 Agent 模式，Chat 内「可选自动生图」 | 认知负担↓，维护面↓ | 需重新设计模式切换与设置 |
| Agent 决策改为纯启发式（去掉上游 JSON 路由） | 延迟↓、空回复类问题↓ | 复杂意图准确率可能下降 |
| Agent 也走 SSE（先 meta「routing」，再 delta） | UX 与 chat 对齐 | 生图阶段仍可能长阻塞 |

适合：产品确认「不需要真 Agent」，只保留轻路由。

### 方向 B：加强为真正 Agent

| 思路 | 价值 | 代价 |
|------|------|------|
| 工具注册表 + 多步循环（chat / 生图 / 改图 / 未来画布） | 可扩展、可解释步骤 | 架构与测试成本高 |
| 流式 intermediate events（thinking / tool_call / image） | 可观测、可取消 | 前后端协议大改 |
| 与工作流 / RunningHub / 画布节点打通 | 创作闭环更强 | 跨页面产品设计 + 关卡流程 |

适合：明确要做「创作助手」产品，且主流程页面已稳定。

### 建议决策顺序（日后）

1. 各页面 P0 功能稳定后，再开产品讨论：要 A 还是 B。  
2. 若选 A：先砍复杂度（启发式或合并模式），再谈 UX。  
3. 若选 B：先产品定义 + 关卡 A/B，再动代码；勿在现状路由器上堆「伪多步」。

---

## 关键代码索引

| 区域 | 路径 |
|------|------|
| 决策 / 端点 | `backend/services/chat_service.py`（`decide_chat_agent_action` / `chat_agent_endpoint`） |
| 路由注册 | `backend/routers/generate.py` |
| 前端请求 | `frontend/src/features/chat/stream.ts` |
| UI / 模式 | `frontend/src/features/chat/ChatPage.tsx` |
| 决策单测 | `backend/tests/unit/test_chat_agent_decision.py` |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-11 | 初版：记录现状、非目标、近期修复上下文、A/B 路线；明确当前优先级为页面功能修复 |
