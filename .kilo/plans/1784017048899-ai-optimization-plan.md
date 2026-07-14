# AI 助手与 AI Agent 优化方案

## 概述

代码库中存在**两套独立的 AI 系统**，服务于不同场景：
- **AI 助手**（`src/components/AiDrawer/`、`src/hooks/useAiStream.ts`）：侧边抽屉式对话，基于 HTTP SSE 流 + 浏览器端工具调用
- **AI Agent**（`agents/pi-agent-server/`、`src/components/AgentApp/`）：全页 WebSocket 代理，Node.js 后端使用 pi-coding-agent SDK

**已确认决策**：保持两套系统独立，但消除代码重复并各自优化。

---

## 发现的问题

### A. 严重重复（必须修复）

1. **`query_superset` 工具在 3 处重复定义**：
   - `aiInsight.ts:39-99` — OpenAI function-calling 格式（硬编码枚举）
   - `agent-orchestrator.ts:88-171` — TypeBox schema
   - 两套系统中隐式通过 system prompt 文本再次定义
   - **方案**：抽取共享工具定义模块，同时提供 OpenAI 和 TypeBox 两种序列化器

2. **数据分析的 System Prompt 在 5 处重复**：
   - `system-prompt.ts`（Agent 服务端）
   - `aiInsight.ts:400-468`（`streamWithTools` 的 toolSystem）
   - `aiInsight.ts:331-332`（`streamChartInsight` 的 system prompt）
   - `useAiStream.ts:51-57`（默认 system prompt）
   - `config/dailyReportPrompt.ts`（报告专用 prompt）
   - **方案**：集中到 `src/config/` 目录，通过共享模块引用

3. **维度/指标枚举在两处硬编码**：
   - `aiInsight.ts:48-64`（`QUERY_SUPERSET_TOOL` 中的 columns enum）
   - `system-prompt.ts:47-55`（文本描述）
   - `agent-orchestrator.ts:118-150`（TypeBox description）
   - **方案**：从实际数据集 schema 动态获取，而非硬编码

### B. 架构冲突

4. **`piAgentClient.ts` 未使用**：该文件实现了完整的 WebSocket 客户端（重连、待发送消息队列、事件 API），但 `PiAgentChat.tsx` 实际使用的是 `PiAgentChatAdapter`，后者自己创建原始 WebSocket 连接。`piAgentClient.ts` 除类型定义外为死代码。

5. **状态管理不一致**，分布在 4 个 store 中：
   - `conversationStore`（助手对话线程）
   - `useInsight` hook（洞察模式状态）
   - `agentStore`（Agent 会话，持久化到 localStorage）
   - `useAiConfigStore`（LLM 配置，独立 localStorage key）
   - 各有自己的 `types.ts`，`MessageContent` 类型略有差异

6. **两套独立的模型配置系统**：
   - 助手：`aiConfig.ts` 预设，存储在 `localStorage` key `superset_ai_presets`
   - Agent：原始 `localStorage` key `pi_agent_model`（在 `PiAgentChat.tsx:279` 读取）

### C. Agent 服务端问题

7. **缺少流式中断机制**：`agent-orchestrator.ts` 中的 `processPrompt()` 不接收 `AbortSignal`。唯一的检查是入口处的 `state === "running"`。前端中断时，LLM 调用会持续到完成。

8. **Schema 注入脆弱**：
   - 优先使用前端 auth token，回退到环境变量用户名/密码登录
   - 两者都失败时静默返回空字符串（仅日志记录）
   - Schema 缓存 5 分钟，期间可能陈旧
   - **方案**：增加重试逻辑，将 schema 错误传播至前端

9. **数据集 ID 硬编码**：`SUPERSET_DATASET_ID` 环境变量默认值为 `26`，不支持多数据集场景

10. **Token 缓存重复**：`querySuperset.ts` 中的 `resolveToken()` 自行实现 JWT 缓存，与前端已提供的 token 重复

11. **最大工具轮次（10）不可配置**：硬编码在 `agent-orchestrator.ts:12`

### D. 前端问题

12. **`streamWithTools` 在浏览器中执行工具调用**：HTTP 工具调用循环在浏览器中直接运行 `executeQuery()`（调用 Superset API）：
    - 依赖浏览器 cookies，无集中式访问控制
    - 工具执行期间会阻塞 JS 线程
    - 无服务端工具使用日志

13. **`useAiStream` 的 `tryRender` 使用 `requestAnimationFrame`**：通过检测 `|` 行来批量渲染 markdown 表格，此方法脆弱且在复杂 markdown 上会出错。`StreamingMessage` 组件已使用 `LightMdRenderer`，每次变更重新渲染。

14. **钻取建议从 LLM 文本输出中解析**：`extractDrillDownSuggestions()` 扫描 `DRILL_DOWN_SUGGESTIONS` 标记并从 markdown 中解析 JSON 块。LLM 可能不遵循精确格式，此方法不够可靠。

15. **`SmartInput` 的斜杠命令定义了但未连接实际功能**：`/explain`、`/sql`、`/chart`、`/help` 仅 UI 展示，设置输入文本但无后续处理。

### E. 测试覆盖不足

16. 前端与 Agent 服务端之间的 **WebSocket 协议缺少集成测试**
17. **`PiAgentChatAdapter` 缺少测试**（生产环境实际使用的适配器）
18. **`piAgentClient.test.ts` 缺失**（死代码无测试）
19. Agent 页面**缺少 E2E 测试**

---

## 任务清单（按优先级排列）

### 阶段一：消除重复（低风险，高收益）

**任务 1.1 — 创建共享工具定义**
- 新建文件：`src/tools/querySupersetTool.ts`
- 导出：`QUERY_SUPERSET_TOOL`（OpenAI 格式）、`buildTypeBoxSchema()`（TypeBox 格式）、`getQuerySupersetToolDescription()`（system prompt 文本）
- 迁移 `aiInsight.ts`、`agent-orchestrator.ts`、`system-prompt.ts` 引用此模块

**任务 1.2 — 集中化 System Prompt**
- 新建文件：`src/config/systemPrompts.ts`
- 导出：`dataAnalystPrompt`（基础）、`chartInsightPrompt`、`reportGenerationGuidelines`、`drillDownGuidelines`
- 迁移全部 5 处引用此模块
- 保留 `dailyReportPrompt.ts`/`weeklyReportPrompt.ts` 不变（报告专用模板）

**任务 1.3 — 统一 AI 模型配置**
- 将 `localStorage` key `pi_agent_model` 合并至 `useAiConfigStore`
- 为现有预设增加 `agentModel` 字段（或共用 `model` 字段）
- 移除 `PiAgentChat.tsx` 中独立的 `ModelSelector` 逻辑

### 阶段二：修复架构缺陷

**任务 2.1 — Agent 服务端增加 AbortSignal 支持**
- 将 `AbortSignal` 通过 `processPrompt()` 传递至 LLM `agentSession.prompt()` 调用
- 在 `agent-orchestrator.ts` 中增加 `abort` 处理器，流式过程中销毁 agent session
- 将 `ws.on("abort")` 与信号传递对接

**任务 2.2 — 废弃 `piAgentClient.ts` 或重构 `PiAgentChatAdapter` 使用它**
- 方案 A：添加 `@deprecated` JSDoc 并移除未使用的导出
- 方案 B：重构 `PiAgentChatAdapter` 内部使用 `PiAgentClient`（免费获得重连、待发送消息、事件 API）

**任务 2.3 — 统一状态管理类型**
- 新建 `src/types/ai.ts`，定义规范化的 `MessageContent`、`ConversationMessage`、`AgentStep` 类型
- 让 `AiDrawer/types.ts` 和 `AgentApp/types.ts` 从此中心模块重新导出
- 确保 `agentStore`、`conversationStore`、`useInsight` 使用相同的基础类型

### 阶段三：质量改进

**任务 3.1 — 基于动态 schema 的工具定义**
- 将工具定义中的硬编码枚举值替换为从 `/api/v1/dataset/{id}` 获取的值
- 缓存于 `localStorage` 或 session 内存，数据集切换时刷新
- 服务端已有指标/列名校验（`querySuperset.ts:311-328`），确保前端 `streamWithTools` 达到同等水平

**任务 3.2 — 为 schema/token 获取增加重试逻辑**
- 在 `resolveToken()` 和 `getSchema()` 中增加指数退避与抖动
- 将认证失败以结构化错误形式呈现给前端（而非仅返回空字符串）
- 将 `X-Internal-Agent` 头设为主要认证方式，而非回退方案

**任务 3.3 — Agent 服务端配置动态化**
- 通过 WebSocket 握手接受 `datasetId`（来自前端上下文），而非仅用环境变量
- 使 `MAX_TOOL_ROUNDS` 可通过环境变量 `AGENT_MAX_TOOL_ROUNDS` 配置

**任务 3.4 — 修复 `SmartInput` 斜杠命令**
- 方案 A：实现实际处理逻辑（`/explain` → 添加上下文，`/sql` → 打开 SQL Lab，`/chart` → 创建图表）
- 方案 B：若暂无规划则移除斜杠命令 UI

**任务 3.5 — 移除 `tryRender` requestAnimationFrame 批处理**
- `StreamingMessage` 组件已通过 `LightMdRenderer` 高效渲染
- `useAiStream.ts:65-80` 中的 `tryRender` 逻辑增加复杂度而无明显收益
- 简化为直接调用 `onToken`

### 阶段四：测试覆盖

**任务 4.1 — WebSocket 协议集成测试**
- 新建文件：`agents/pi-agent-server/src/__tests__/router.test.ts`
- 测试：`new_session` → `session_created`，`prompt` → `agent_start` → `message_update` → `agent_end`
- 测试：流中中断、模型切换、错误恢复

**任务 4.2 — `PiAgentChatAdapter` 测试**
- 新建文件：`src/api/__tests__/piAgentAdapter.test.ts`
- Mock WebSocket，测试消息序列化/反序列化
- 测试 chunk 映射：`thinking_delta` → `reasoning-delta`，`tool_execution_start` → `tool-input-available`

**任务 4.3 — Agent 页面 E2E 测试**
- 新建文件：`playwright/agent.spec.ts`
- 测试：打开 Agent 页面，发送消息，验证响应出现
- 测试：模型切换、会话创建/删除

---

## 风险与约束

1. **pi-coding-agent SDK 依赖**：Agent 服务端与 `@earendil-works/pi-coding-agent` 和 `@earendil-works/pi-ai` 紧密耦合。任何对 Agent 服务端的重要重构都必须考虑 SDK API 稳定性。
2. **缺少动态数据集信息的后端 API**：`getSchema()` 函数从硬编码的数据集 ID 获取数据。支持多数据集需要 API 变更或前端传递数据集上下文。
3. **移除 `tryRender`（任务 3.5）可能导致流式显示抖动**——需要用包含 markdown 表格的实际 LLM 输出来验证。

---

## 执行顺序

阶段一（消除重复） → 阶段二（修复缺陷） → 阶段三（质量改进） → 阶段四（测试覆盖）

阶段一是独立且价值最高的部分。阶段二和阶段三可在阶段一完成后并行进行。阶段四需要阶段一至三全部完成。
