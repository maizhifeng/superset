# AI Agent 模式落地设计：从 BI 工具到对话式分析平台

## 1. 理解与设计目标

### 1.1 当前架构（传统 BI 模式）

```
┌──────────────────────────────────────────────────────────────┐
│  ActivityBar (48px)  │  SidePanel  │  Main Content Area      │
│  ┌──────┐            │  (可选)     │  ┌────────────────────┐ │
│  │ BI   │            │            │  │ Dashboard / Chart  │ │
│  │ 导航  │            │            │  │ / Dataset / SQL    │ │
│  ├──────┤            │            │  │ ... page content   │ │
│  │      │            │            │  └────────────────────┘ │
│  │ AI   │            │            │  ┌────────────────────┐ │
│  │ 按钮  │            │            │  │  AiDrawer (侧边栏)  │ │
│  └──────┘            │            │  └────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- AI 是附属功能：侧边栏抽屉、小窗口对话
- 用户手动导航，AI 仅被动应答

### 1.2 目标架构（Agent 模式）

```
Agent Mode (URL: /agent)
┌──────────────────────────────────────────────┐
│  StatusBar (mode switch toggle)               │
├──────────────────────────────────────────────┤
│  AgentChat (全屏对话式应用)                     │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Welcome / History                     │  │
│  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐            │  │
│  │  │ 分析 │ │ 查询 │ │ 报表 │ │ 对比 │  ...   │  │
│  │  └───┘ └───┘ └───┘ └───┘            │  │
│  │                                        │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │ Messages (对话流)                │  │  │
│  │  │  · AI 数据查询结果                │  │  │
│  │  │  · 分析的图表 (内嵌 ECharts)      │  │  │
│  │  │  · 钻取建议卡片                   │  │  │
│  │  │  · 步骤追踪                       │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │                                        │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │ SmartInput + 意图选择器          │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

- AI 是主体应用：全屏对话界面，BI 能力嵌入对话
- AI 主动规划、查询、分析、可视化
- 用户的"导航"行为变为自然语言描述意图

### 1.3 渐进式迁移路径

```
Traditional Mode ──→ Mixed Mode ──→ Agent Mode
(纯 BI 界面)     (AI 侧边栏)     (纯对话应用)
                    (当前状态)
```

- **传统模式**: 完全保留当前 UI，AI 功能仅通过侧边栏访问
- **Agent 模式**: 全屏对话式应用，隐藏 BI 侧边栏/导航，通过 URL 路径 `/agent` 访问
- **模式切换**: 通过顶部状态栏或快捷键切换，两种模式并存

---

## 2. 整体架构

### 2.1 路由架构变更

```
/superset-frontend-new/src/views/App.tsx 新增路由:

/                  → 传统 BI 模式 (ProtectedLayout → AppLayout)
/agent             → Agent 模式 (ProtectedAgentLayout → AgentApp)
/agent/*           → Agent 子路由（会话恢复、设置等）
/login             → 登录页（不变）
```

```typescript
// 新增：Agent 模式的独立布局
function ProtectedAgentLayout({ children }) {
  return (
    <ProtectedRoute>
      <AgentApp>{children}</AgentApp>
    </ProtectedRoute>
  );
}

// App.tsx 新增路由
<Route path="/agent" element={
  <ProtectedAgentLayout>
    <AgentChat />    {/* 全屏对话应用 */}
  </ProtectedAgentLayout>
} />
<Route path="/agent/*" element={
  <ProtectedAgentLayout>
    <AgentChat />
  </ProtectedAgentLayout>
} />
```

### 2.2 Agent 模式独立布局组件：`components/AgentApp/AgentApp.tsx` (新增)

```typescript
// 全屏 Agent 布局，取代 AppLayout
export default function AgentApp({ children }) {
  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* 轻量状态栏：模式切换 + 用户菜单 */}
      <AgentStatusBar onSwitchToTraditional={() => navigate("/")} />
      {/* 对话主界面 */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        {children}
      </Box>
    </Box>
  );
}
```

AgentApp 替代 AppLayout，连 ActivityBar 都不需要，将屏幕空间全部给对话界面。

### 2.3 传统模式入口切换触发点

传统 BI 模式中，在 **ActivityBar** 的 AI 按钮区域增加切换选项：

```typescript
// AppLayout.tsx 中 aiButton 附近
aiButton: (
  <Tooltip title="AI Agent" placement="right">
    <IconButton onClick={() => navigate("/agent")}>
      <AutoAwesomeIcon />
    </IconButton>
  </Tooltip>
)
```

点击后直接导航到 `/agent`，切换到全屏 Agent 模式。
传统模式的 AI 侧边栏（AiDrawer）仍保留作为轻量辅助。

---

## 3. 组件树对比

### 3.1 传统模式组件树

```
App
└─ ProtectedLayout
   └─ AppLayout
      ├─ ActivityBar     (48px 导航栏)
      ├─ SidePanel       (可选侧面板)
      ├─ Main Content    (Dashboard/Chart/...)
      └─ AiDrawer        (AI 侧边栏抽屉)
```

### 3.2 Agent 模式组件树

```
App
└─ ProtectedAgentLayout
   └─ AgentApp
      ├─ AgentStatusBar  (轻量状态栏)
      └─ AgentChat
         ├─ AgentWelcome       (欢迎屏 + 快捷入口)
         ├─ AgentMessages      (对话消息流)
         │  ├─ MessageBubble   (文本消息)
         │  ├─ AgentStepCard   (执行步骤卡片)  ★ 新增
         │  ├─ AgentChartCard  (内嵌图表)      ★ 新增
         │  └─ AgentDrillDown  (钻取建议)      ★ 新增
         ├─ AgentStepsPanel    (执行进度面板)   ★ 新增
         └─ AgentInput
            ├─ IntentSelector  (意图快捷选择)   ★ 新增
            └─ SmartInput      (消息输入框)
```

---

## 4. 核心接口调用逻辑

### 4.1 数据流全景

```
用户输入 "分析近7天各渠道消耗趋势"
    │
    ▼
AgentChat.handleSend(text)
    │
    ▼
AgentProvider.execute(prompt, {
  context: { /* 当前会话上下文 */ }
})
    │
    ├─ Step 1: Intent Classification（LLM 内置）
    │   → 分析 → 决定需要查询数据
    │
    ├─ Step 2: Function Calling Loop
    │   │
    │   ├─ Round 1:
    │   │   LLM → tool_call → query_superset({columns, metrics, time_range})
    │   │   ├─ executeQuery() → Markdown 表格
    │   │   └─ AgentStepCard rendered in messages
    │   │
    │   ├─ Round 2:
    │   │   LLM → 分析数据 → 再调用 query_superset（钻取）
    │   │   └─ AgentStepCard updated
    │   │
    │   └─ Round 3:
    │       LLM → 输出最终分析报告
    │       └─ MessageBubble rendered
    │
    └─ Step 3: 状态更新 & 缓存
        └─ conversationStore.addMessage() 持久化
```

### 4.2 API 调用关系

| 前端函数 | 调用后端 API | 用途 |
|---------|-------------|------|
| `executeQuery()` | `POST /api/v1/chart/data` | 动态数据集查询（白名单约束） |
| `fetchWeeklyReportData()` | `POST /api/v1/chart/data` (4 queries) | 批量提取周报数据 |
| `fetchDailyReportData()` | `POST /api/v1/chart/data` (5 queries) | 批量提取日报数据 |
| `fetchDrillDownData()` | `POST /api/v1/chart/data` (4 queries) | 批量提取钻取数据 |
| `queryDrillDown()` | `POST /api/v1/chart/data` | 动态钻取查询 |
| `streamWithTools()` | `POST /llm/chat/completions` | LLM 函数调用对话 |
| `streamDirectChat()` | `POST /llm/chat/completions` | LLM 纯对话 |

Agent 模式的核心是 `streamWithTools()` → `executeQuery()` 的组合循环。

### 4.3 Tool 生态扩展

```typescript
// api/aiInsight.ts 原有工具
const QUERY_SUPERSET_TOOL = { /* 查询数据集 */ };

// Agent 模式新增工具
const CREATE_CHART_TOOL = {
  name: "create_chart",
  description: "创建并保存图表到 Superset",
  params: { viz_type, metrics, groupby, title }
};

const COMPARE_DATA_TOOL = {
  name: "compare_data",
  description: "对比两段时间范围的数据",
  params: { columns, metrics, range1, range2 }
};

const LIST_DASHBOARDS_TOOL = {
  name: "list_dashboards",
  description: "列出用户可访问的仪表板",
  params: { search? }
};
```

---

## 5. 模块交互规则

### 5.1 状态管理层

```
useAgentStore (Zustand, 新增)
─────────────────────────────────────
- mode: "traditional" | "agent"      ← 当前模式
- sessions: AgentSession[]           ← 多会话管理
- activeSessionId: string
- sessionStatus: "idle" | "running" | "done"

方法:
- switchMode()          → 切换传统/Agent 模式
- createSession()       → 新建 Agent 会话
- getActiveSession()    → 获取当前会话
- addStep()             → 添加执行步骤
- updateStep()          → 更新步骤状态
- setResult()           → 设置最终结果

存储策略:
- 传统模式: 不使用此 store
- Agent 模式: localStorage 持久化会话历史
```

### 5.2 Hook 架构

```
hooks/useAgent.ts (新增)
─────────────────────
职责: Agent 执行编排

输入: prompt, context
输出: steps[], finalResult, isRunning
内部:
  - 调用 streamWithTools()
  - 解析 tool_calls → 更新 steps
  - 解析文本流 → 更新 finalResult
  - 通过 callbacks.onStep() 通知外部步骤变化

---------

hooks/useAiStream.ts (现有，无变化)
─────────────────────
职责: LLM 流式对话基础能力

Agent 模式复用此 hook 的 stream / stop / streaming

---------

hooks/useInsight.ts (现有，无变化)
─────────────────────
职责: 图表洞察分析

仅用于传统模式的 chart insight，Agent 模式不使用此 hook
```

### 5.3 消息类型扩展

```typescript
// components/AiDrawer/types.ts
export type MessageContent =
  | { type: "text"; body: string }
  | { type: "chart"; chartId: number; title: string }
  | { type: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { type: "sql"; sql: string }
  | { type: "error"; message: string; retryable: boolean }
  | { type: "agent_step"; step: AgentStep }          // ★ 新增
  | { type: "agent_done"; steps: AgentStep[]; summary: string }; // ★ 新增
```

### 5.4 Agent 步骤模型

```typescript
export interface AgentStep {
  id: string;
  type: "query" | "analyze" | "chart" | "report" | "drilldown" | "compare";
  status: "pending" | "running" | "done" | "error";
  description: string;
  result?: string;            // Markdown 格式结果
  subSteps?: AgentStep[];     // 子步骤（嵌套）
  timestamp: number;
  duration?: number;          // 执行耗时 ms
}
```

---

## 6. 实现路径（4 阶段）

### Phase 1: 基础框架搭建

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 新增全局模式 Store | `store/agentStore.ts` | `useAgentStore`，管理 `mode` 切换和会话 |
| 1.2 新增 Agent 路由 | `views/App.tsx` | 添加 `/agent` 路由和 `ProtectedAgentLayout` |
| 1.3 新建 AgentApp 布局 | `components/AgentApp/AgentApp.tsx` | 全屏对话布局，取代 AppLayout |
| 1.4 新建 AgentStatusBar | `components/AgentApp/AgentStatusBar.tsx` | 模式切换开关 + 用户菜单 |
| 1.5 新建 AgentChat | `components/AgentApp/AgentChat.tsx` | 对话主容器，组合消息区 + 输入区 |
| 1.6 新建 AgentWelcome | `components/AgentApp/AgentWelcome.tsx` | 欢迎屏：快捷意图入口、历史会话 |
| 1.7 改造 ActivityBar AI 按钮 | `components/AppLayout.tsx` | 点击后 `navigate("/agent")` |
| 1.8 新建 useAgent hook | `hooks/useAgent.ts` | 编排核心逻辑 |

### Phase 2: Agent 执行引擎

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 扩展 streamWithTools | `api/aiInsight.ts` | 增加 `onStep` 回调、更多 tool 定义 |
| 2.2 新增工具函数 | `api/querySuperset.ts` | `executeChartCreation()`、`executeComparison()` |
| 2.3 新建 AgentStepCard | `components/AgentApp/AgentStepCard.tsx` | 步骤追踪 UI 组件 |
| 2.4 新建 AgentStepsPanel | `components/AgentApp/AgentStepsPanel.tsx` | 执行进度面板（可折叠侧边）|
| 2.5 Agent 消息渲染 | `components/AgentApp/AgentChat.tsx` | 渲染 agent_step / agent_done 消息 |
| 2.6 会话持久化 | `store/agentStore.ts` | localStorage 存储会话历史 |

### Phase 3: 对话式 BI 能力

| 任务 | 说明 |
|------|------|
| 3.1 内嵌数据表格 | 查询结果直接渲染为可排序/分页的 MUI DataGrid |
| 3.2 内嵌图表 | 通过 ECharts 在对话中渲染查询结果的图表可视化 |
| 3.3 钻取交互 | 消息中的 DrillDown 建议可直接点击执行，追加到对话 |
| 3.4 报告生成 | 复用现有 weeklyReport/dailyReport 数据管道 |
| 3.5 对比分析 | 新增 `compare_data` tool，支持 W1/W2 对比 |

### Phase 4: 体验优化

| 任务 | 说明 |
|------|------|
| 4.1 意图快捷入口 | Welcome 屏 + 输入框前置意图选择器 |
| 4.2 流式渲染优化 | 一边查询一边展示中间步骤结果 |
| 4.3 快捷键 | `/` 激活输入、`Ctrl+Enter` 发送、`Esc` 停止 |
| 4.4 模式间上下文保持 | 传统模式的分析→切换到 Agent 继续对话 |
| 4.5 移动端适配 | Agent 模式在移动端响应式布局 |

---

## 7. 核心代码变更摘要

### 7.1 App.tsx 路由变更

```typescript
const AgentChat = lazy(() => import("@/components/AgentApp/AgentChat"));

function ProtectedAgentLayout({ children }) {
  return (
    <ProtectedRoute>
      <AgentApp>{children}</AgentApp>
    </ProtectedRoute>
  );
}

// 新增路由
<Route path="/agent" element={
  <ProtectedAgentLayout><AgentChat /></ProtectedAgentLayout>
} />
<Route path="/agent/*" element={
  <ProtectedAgentLayout><AgentChat /></ProtectedAgentLayout>
} />
```

### 7.2 store/agentStore.ts

```typescript
export type AppMode = "traditional" | "agent";

interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  steps: AgentStep[];
  messages: ConversationMessage[];
  summary?: string;
}

interface AgentStoreState {
  mode: AppMode;
  sessions: AgentSession[];
  activeSessionId: string | null;

  switchMode: (mode: AppMode) => void;
  createSession: () => string;
  getActiveSession: () => AgentSession | undefined;
  addStep: (step: AgentStep) => void;
  updateStep: (id: string, updates: Partial<AgentStep>) => void;
  addMessage: (msg: ConversationMessage) => void;
}
```

### 7.3 hooks/useAgent.ts

```typescript
export function useAgent() {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [finalResult, setFinalResult] = useState("");

  const execute = useCallback(async (text: string, context?: AgentContext) => {
    setIsRunning(true);

    // 1. 创建新步骤
    const step = { id: genId(), type: "analyze", status: "running", ... };
    addStep(step);

    // 2. 调用 streamWithTools（复用现有 LLM 流式引擎）
    const full = await streamWithTools(
      AGENT_SYSTEM_PROMPT,
      text,
      {
        onText: (t) => { /* 累积文本 */ },
        onStep: (s) => { /* 更新步骤 */ },
        onError: (e) => { /* 错误处理 */ },
      },
      signal,
      modelCfg,
      history,
      maxRounds,
    );

    // 3. 聚合结果
    setFinalResult(full);
    setIsRunning(false);
  }, []);

  return { steps, isRunning, finalResult, execute, stop, clear };
}
```

### 7.4 components/AgentApp/AgentChat.tsx (核心页面)

```typescript
export default function AgentChat() {
  const agent = useAgent();
  const conversationStore = useConversationStore();

  const handleSend = async (text: string) => {
    // 添加用户消息
    conversationStore.addMessage(threadId, "user", { type: "text", body: text });

    // 执行 Agent
    await agent.execute(text, { /* context */ });

    // 添加 AI 消息（含执行步骤）
    conversationStore.addMessage(threadId, "assistant", {
      type: "agent_done",
      steps: agent.steps,
      summary: agent.finalResult,
    });
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* 消息列表 */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {messages.map(msg => renderMessage(msg))}
      </Box>
      {/* 输入区 */}
      <AgentInput onSend={handleSend} onStop={agent.stop} streaming={agent.isRunning} />
    </Box>
  );
}
```

---

## 8. 安全与约束

| 约束 | 实现 |
|------|------|
| 数据安全 | 复用现有 Superset 认证 + CSRF token |
| 查询白名单 | 仅有 6 个维度列、13 个指标可查 |
| 行数限制 | row_limit ≤ 1000 |
| 执行轮次 | MAX_ROUNDS = 5 |
| 可中止 | AbortSignal 贯穿所有流式请求 |
| 图表创建 | 需用户二次确认才可保存 |

---

## 9. 新旧模式并存说明

| 维度 | 传统模式 (`/`) | Agent 模式 (`/agent`) |
|------|---------------|----------------------|
| 布局 | ActivityBar + SidePanel + Main + AiDrawer | AgentStatusBar + AgentChat |
| 导航 | 图标导航栏 + 侧面板 | 自然语言 + 快捷意图 |
| AI 形态 | 侧边栏抽屉 | 全屏对话应用 |
| 操作方式 | 手动点击、拖拽 | 自然语言指令 |
| 数据查询 | 图表内置查询 | Agent 自动查询 |
| 报告生成 | 通过知识卡片触发 | 自然语言描述需求 |
| 模式切换 | ActivityBar AI 按钮 | 顶部栏切换开关 |
| 并行使用 | 可同时开启 | 独立路由隔离 |

用户可以在两种模式间自由切换，根据任务复杂度选择合适的交互方式。
