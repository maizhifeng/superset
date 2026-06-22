# Pi Agent 集成计划：从自定义 streamWithTools 到 @earendil-works/pi-coding-agent

## 1. 架构总览（当前实现）

```
┌─────────────────────────────────────────────────────────────────────┐
│  docker-compose-light.yml                                           │
│                                                                     │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐│
│  │ Container: superset-light    │  │ Container: superset-node     ││
│  │                              │  │  (同一 Node.js 容器)          ││
│  │  Flask Backend               │  │                              ││
│  │  ├── /api/v1/chart/agent-data│  │  ├── Vite Dev Server (9000) ││
│  │  │   (internal, no CSRF)    │  │  │   └── React Frontend     ││
│  │  ├── /llm/chat/completions   │  │  │       PiAgentClient      ││
│  │  │                           │  │  │       ↕ WebSocket        ││
│  │  │  (X-Internal-Agent        │  │  ├── Pi Agent Service      ││
│  │  │   + X-User-Id header      │  │  │   (port 3001, background)││
│  │  │   + g.user bypass)        │  │  │                          ││
│  │  └── RBAC via g.user         │  │  │  @earendil-works/        ││
│  └──────────────────────────────┘  │  │   pi-coding-agent SDK    ││
│                                    │  │                           ││
│  LLM (host:1234)                   │  │  createAgentSession()     ││
│  ←── host.docker.internal ────────│  │  ├── customTools:          ││
│                                    │  │  │   └── query_superset   ││
│                                    │  │  │       → fetch(Flask)   ││
│                                    │  │  ├── Provider: flask-llm  ││
│                                    │  │  │   → fetch(LLM host)    ││
│                                    │  │  ├── noTools: "builtin"   ││
│                                    │  │  └── before_agent_start   ││
│                                    │  │       → system prompt     ││
│                                    └──────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

Pi agent 与 Vite 共用 `superset-node` 容器，通过 `docker/docker-frontend-mui.sh` 以后台进程启动。同容器内 `localhost:3001` 直连。LLM 直接请求 `host.docker.internal:1234`（跳过 Flask 代理）。

## 2. 确认的设计决策

| 决策 | 结论 |
|------|------|
| Pi agent 运行位置 | 独立 Node.js 后端 WebSocket 服务 |
| 代码位置 | `superset-frontend-new/agents/pi-agent-server/` |
| SDK API | `createAgentSession()` + `customTools` + extension `registerProvider()` |
| 前端通信协议 | WebSocket，Vite proxy 转发 `/agent/ws` → `ws://localhost:3001` |
| LLM 提供方 | 直连 `http://host.docker.internal:1234/v1`，`api: "openai-completions"` |
| Tool → Flask | Pi agent tool 中 `fetch("http://superset-light:8088/api/v1/chart/agent-data")` |
| Flask 认证 | 新 endpoint `/agent-data`，无 `@protect()`，CSRF 已 exempt，`g.user = security_manager.find_user(username=X-User-Id)` |
| 前端迁移策略 | 增量替换：保留 UI 组件 + Zustand store，替换 `streamWithTools()` |
| 初始 tools | 仅 `query_superset` |
| 容器环境 | 多容器 docker-compose，Node.js 22，Flask dev mode |

## 3. 当前项目结构

```
superset-frontend-new/
├── agents/pi-agent-server/
│   ├── package.json                 # @earendil-works/pi-coding-agent@^0.79.9, ws, typebox
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 # WebSocket 服务入口 + createAgentSession()
│       ├── extension.ts             # pi.registerProvider("flask-llm") + before_agent_start
│       ├── system-prompt.ts         # buildSystemPrompt() — 中文数据分析师提示词
│       ├── ws-handler.ts            # WebSocket 消息路由、session 生命周期
│       ├── types.ts                 # ClientMessage / ServerMessage 协议定义
│       └── tools/
│           └── querySuperset.ts     # buildMetricEntry() + executeQuerySuperset()
├── src/
│   ├── api/piAgentClient.ts         # WebSocket 客户端（自动重连、消息队列）
│   ├── hooks/usePiAgent.ts          # React hook → Zustand store 事件映射
│   └── components/AgentApp/
│       ├── AgentChat.tsx            # usePiAgent() 替换 useAgent()
│       ├── AgentStatusBar.tsx       # 连接状态指示器
│       ├── AgentStepCard.tsx        # 不变
│       ├── AgentSessionSidebar.tsx  # 不变
│       ├── AgentWelcome.tsx         # 不变
│       └── MarkdownRenderer.tsx     # Markdown 格式化组件
superset/
└── charts/data/api.py               # 新增 /agent-data endpoint
```

**移除的文件**：
- `agents/pi-agent-server/src/provider.ts` — 不再需要（配置移至 extension.ts + index.ts）

## 4. SDK API 差异（计划 vs 实际）

| 计划 | 实际 | 原因 |
|------|------|------|
| `PiAgent` 类 | `createAgentSession()` | SDK 无 `PiAgent` 类，使用工厂函数 |
| `agent.streamText()` | `session.prompt()` + `session.subscribe()` | SDK 的事件驱动模式 |
| `defineTool()` 全局注册 | `customTools` 参数 + closure 注入 userId | 每个 session 需要独立 userId |
| `ctx.user_id` 传递 | closure `userId` 变量 | ToolDefinition 的 ExtensionContext 不含自定义字段 |
| `typebox` 独立依赖 | SDK 自带 `typebox` | pi-coding-agent 已依赖 typebox 1.1.38 |
| `@earendil-works/pi-ai` 独立依赖 | 仅 type import | 仅用于 `Model` 类型，运行时由 SDK 提供 |
| `registerProvider()` 独立函数 | extension `pi.registerProvider()` | 必须通过 extension factory 注册 provider |
| Flask `/llm` 代理 LLM | 直连 `host.docker.internal:1234` | Flask 无 `/llm` 路由，仅在 Vite 有 proxy |
| 复用 `/api/v1/chart/data` | 新建 `/api/v1/chart/agent-data` | CSRF + JWT 绕不过，新建无认证 endpoint |
| MAX_ROUNDS=5 | 无上限 | 依赖 SDK 内部管理，外部未设限 |
| `.env` 环境变量 | `LLM_BASE_URL`, `LLM_MODEL`, `FLASK_INTERNAL_URL` | 容器内通过 docker-compose env 传递 |

## 5. WebSocket 协议（当前实现）

```
客户端 → 服务端:
  { type: "new_session", user_id: "..." }
  { type: "prompt", message: "..." }
  { type: "abort" }
  { type: "delete_session" }

服务端 → 客户端:
  { type: "session_created", sessionId: "..." }
  { type: "agent_start" }
  { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "..." } }
  { type: "tool_execution_start", toolCallId, toolName: "query_superset", args: {columns, metrics, time_range, filters, orderby, row_limit} }
  { type: "tool_execution_end", toolCallId, result: "markdown table string" }
  { type: "agent_end", messages: [...], finalText: "..." }
  { type: "error", message: "...", retryable: true/false }
```

## 6. 系统提示词结构（system-prompt.ts 约 160 行）

| 章节 | 内容 |
|------|------|
| 角色定义 | 专业数据分析师，使用 query_superset 工具 |
| 使用方法 | columns/metrics/time_range 说明 |
| 钻取分析规范 | 必须含「日期」列、逐日视角 |
| 钻取查询规则 | 📊 前缀识别、filters 传递实体 |
| 维度说明 | 6 列 + 实际枚举值（从数据集查询获得） |
| 指标说明 | 10+ 指标 + 计算公式（cpa, roi_1, ltv_1 等） |
| LTV 曲线分析 | 7日充值 / 新增进入 |
| 输出规范 | 中文 Markdown、禁止 LaTeX |
| 业务含义解读 | 消耗/新增/CPA/ROI 联动解读 |
| **报表模板** | 双周对比表格（6/7-6/13 vs 6/14-6/20）|
| **渠道商/媒体明细** | 排名表格 + 合计行 |
| **优化建议** | 2-3 条关联具体数据 |
| 对比分析规范 | W1 vs W2、变化率计算 |

## 7. 已知问题与逻辑漏洞

### P0 — 必须修复

| # | 问题 | 影响 | 文件 |
|---|------|------|------|
| 1 | **系统提示词重复**：`getSystemPrompt` 在 `DefaultResourceLoader` 和 `before_agent_start` 扩展事件中都设置。SDK 链式追加（不是覆盖），导致提示词出现两次，LLM 可能忽略部分指令。 | 报表格式不准确 | `index.ts:22` + `extension.ts:21` |
| 2 | **subscribe 监听器泄漏**：`handlePrompt` 每次调用都执行 `agentSession.subscribe()`。旧监听器通过 `_piSub()` 清除，但仅在下次 `handlePrompt` 开始时才清除。如果 `session.prompt()` 中途抛出异常，旧监听器不会清理 → 积累 → 文本加倍。 | 字符重复、流式输出加倍 | `ws-handler.ts:102-138` |
| 3 | **abort 销毁 session 留下空引用**：`abort` 调用 `agentSession.dispose()` 销毁 SDK session，但 `(ws as any)._agentSession` 仍然指向已销毁的对象。下次 `prompt` 使用时崩溃。 | 后续消息完全失效 | `ws-handler.ts:237-243` |
| 4 | **finalText 只取最后一条 assistant 消息**：多轮对话（tool call → result → LLM 继续）有多个 assistant 消息，只有最后一条被提取，丢弃了中间的分析文本。 | 对话历史不完整 | `ws-handler.ts:144-149` |

### P1 — 高优改进

| # | 问题 | 影响 | 文件 |
|---|------|------|------|
| 5 | **Tool calling 无轮次上限**：旧系统有 `MAX_ROUNDS=5`。SDK 内部管理循环但未配置上限。LLM 可能进入无限 tool call 循环。 | 无限执行、资源耗尽 | `index.ts`（配置缺失） |
| 6 | **usePiAgent 非单例**：`AgentChat` 和 `AgentStatusBar` 各自调用 `usePiAgent()`，各自创建独立的 `PiAgentClient` 和 WebSocket 连接。`AgentStatusBar` 的连接状态永远显示错误。 | 状态栏连接指示器不准 | `usePiAgent.ts` |

### P2 — 中优改进

| # | 问题 | 影响 | 文件 |
|---|------|------|------|
| 7 | **pendingMessages 可能永久丢失**：WebSocket 连接失败时，`new_session` 未发送，`sessionId` 永远为 null，队列中的消息永远不 flush。 | 用户消息静默丢失 | `piAgentClient.ts:88-91` |
| 8 | **数据集 ID 26 硬编码**：tool 描述、参数校验、`executeQuerySuperset` 三处硬编码 dataset 26。迁移数据集时全部失效。 | 不可迁移 | `ws-handler.ts` + `querySuperset.ts` |
| 9 | **会话标题被快捷提示词覆写**：快捷按钮发送的提示词（如"生成上周的广告投放周报"）变成会话标题，用户无法从侧边栏识别会话。 | 交互体验差 | `agentStore.ts:102-107` |
| 10 | **Flask /agent-data 无速率限制**：无 throttling 保护。Buggy LLM 可高频请求，导致数据库压力。 | 资源滥用风险 | `charts/data/api.py:86-115` |
| 11 | **Vite proxy ECONNREFUSED**：Pi agent 启动较慢时，Vite 代理 WebSocket 连接失败，前端无提示重试（客户端自动重连，但首次连接可能失败）。 | 初次加载需刷新 | `docker-frontend-mui.sh` 启动顺序 |

## 8. 修复计划

| 优先级 | 修复项 | 方案 |
|--------|--------|------|
| P0-1 | 提示词重复 | 删除 `DefaultResourceLoader` 的 `getSystemPrompt`，仅保留 `before_agent_start` |
| P0-2 | subscribe 泄漏 | `_piSub()` 移到 `final` 块；或改用单次订阅 + 消息队列模式 |
| P0-3 | abort 残留 | `abort` 改为调用 `session.abort()`（非 `dispose()`）；或重建 session 后更新引用 |
| P0-4 | finalText 残缺 | 遍历所有 assistant messages 拼接 `\n\n` |
| P1-5 | 轮次上限 | 在 `createAgentSession` 配置 `maxToolCalls`（验证 SDK 是否支持） |
| P1-6 | usePiAgent 单例 | 用 React Context 或模块级 ref 共享 `PiAgentClient` 实例 |
| P2-7 | pendingMessages 超时 | 5s 超时重试；重连后重新发送 |
| P2-8 | 数据集配置化 | 从环境变量 `DATASET_ID` 读取 |
| P2-9 | 会话标题 | 快捷提示词截断为 "报表分析"、"数据查询" 等简短标题 |

## 9. Flask 端说明

| 方面 | 详情 |
|------|------|
| 端点 | `POST /api/v1/chart/agent-data` |
| 认证 | `X-User-Id` header → `security_manager.find_user(username=...)` → `g.user` |
| CSRF | 已 exempt：`csrf.exempt("superset.charts.data.api.agent_data")` |
| 查询 | 复用 `ChartDataCommand(query_context)` + `_create_query_context_from_form()` |
| 数据流 | JSON body → QueryContext → validate → SQL → PostgreSQL → JSON result |
| 依赖 | `include_route_methods` 必须包含 `"agent_data"` |
| 热重载 | Flask debug 模式下代码变更会丢失路由注册，需重启容器 |

## 10. 环境变量

| 变量 | 用途 | 当前值 |
|------|------|--------|
| `LLM_BASE_URL` | Pi agent → LLM 地址 | `http://host.docker.internal:1234/v1` |
| `LLM_MODEL` | LLM 模型 ID | `gemma-4-e2b-it` |
| `FLASK_INTERNAL_URL` | Pi agent → Flask 内部调用 | `http://superset-light:8088` |
| `WS_PORT` | Pi agent WebSocket 端口 | `3001` |
| `VITE_PI_AGENT_WS_URL` | 前端 WebSocket（开发用） | `ws://localhost:9000/agent/ws`（Vite proxy） |

## 11. 文件变更清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `superset-frontend-new/agents/pi-agent-server/package.json` | Node.js 项目配置 |
| `superset-frontend-new/agents/pi-agent-server/tsconfig.json` | TypeScript 配置 |
| `superset-frontend-new/agents/pi-agent-server/src/index.ts` | WebSocket 服务入口 + createAgentSession |
| `superset-frontend-new/agents/pi-agent-server/src/extension.ts` | provider 注册 + before_agent_start |
| `superset-frontend-new/agents/pi-agent-server/src/system-prompt.ts` | 完整系统提示词（~160 行） |
| `superset-frontend-new/agents/pi-agent-server/src/ws-handler.ts` | WebSocket 连接管理 |
| `superset-frontend-new/agents/pi-agent-server/src/tools/querySuperset.ts` | query_superset 工具（buildMetricEntry + executeQuerySuperset） |
| `superset-frontend-new/agents/pi-agent-server/src/types.ts` | 协议类型 |
| `superset-frontend-new/src/api/piAgentClient.ts` | 前端 WebSocket 客户端（自动重连、消息队列） |
| `superset-frontend-new/src/hooks/usePiAgent.ts` | React hook（事件→Zustand store 映射） |
| `superset-frontend-new/src/components/AgentApp/MarkdownRenderer.tsx` | Markdown → MUI 组件渲染 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `AgentChat.tsx` | `useAgent()` → `usePiAgent()`，流式文本实时渲染，动态滚动 |
| `AgentStatusBar.tsx` | 添加连接状态绿色/红色圆点 |
| `vite.config.ts` | 添加 `/agent/ws` WebSocket proxy |
| `docker-frontend-mui.sh` | 在 Vite 前启动 Pi agent 后台进程 + trap 清理 |
| `charts/data/api.py` | 新增 `/agent-data` endpoint + `include_route_methods` + CSRF exempt |
| `initialization/__init__.py` | CSRF exempt `superset.charts.data.api.agent_data` |

### 移除文件

| 文件 | 原因 |
|------|------|
| `agents/pi-agent-server/src/provider.ts` | 配置移至 extension.ts + index.ts |
| `@earendil-works/pi-ai` 运行时依赖 | 仅 type import，SDK 自带 |
| `typebox` 独立依赖 | pi-coding-agent 已依赖 |

## 12. 删除/弃用

| 后续可清理 | 说明 |
|------------|------|
| `aiInsight.ts` 中的 `streamWithTools()` | 被 Pi agent 替换（Agent 模式） |
| `hooks/useAgent.ts`（如仍存在） | 被 `usePiAgent.ts` 替换 |

**注意**: 保留 `streamChartInsight()`、`streamChat()`、`streamDirectChat()` 等传统模式 AiDrawer 使用的函数不变，仅 Agent 模式切换为 Pi agent。

## 13. 验证状态

| 验证项 | 状态 |
|--------|------|
| WebSocket 连接正常 | ✅ 通过 |
| prompt 发送 + 流式输出 | ✅ 通过（text_delta 事件，闪烁光标） |
| tool_execution 正常 | ✅ 通过（query_superset 调用 Flask 并返回数据） |
| 结果渲染 | ✅ 通过（MUI Table + MarkdownRenderer） |
| 用户上下文传递 | ✅ 通过（`X-User-Id` → `g.user`） |
| 快捷按钮（数据分析/查询/报表/对比） | ✅ 通过（消息队列等待 session_created） |
| 生成报表模板 | ✅ 通过（双周对比 + 渠道/媒体明细 + 优化建议） |
| CSRF 豁免 | ✅ 通过（新端点 `/agent-data`，无 `@protect`） |
| Flask debug 热重载失路由 | ⚠️ 需重启 superset-light 容器 |
| 断线重连 | ✅ 通过（5 次自动重试） |
| 传统模式不受影响 | ✅ `/` 路径 AiDrawer 正常 |

## 14. 回退方案

保留现有 `streamWithTools()` 代码不变。传统模式下 `AiDrawer` 仍使用旧流程。Agent 模式通过 `usePiAgent()` 切换。
