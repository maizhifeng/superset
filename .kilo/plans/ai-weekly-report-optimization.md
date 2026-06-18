# AI 助手周报功能 — 优化分析报告

## 一、功能现状概述

AI 助手周报功能由三个核心模块组成：

| 文件 | 职责 | 行数 |
|------|------|------|
| `superset-frontend-new/src/api/weeklyReport.ts` | 数据查询：4 路 Superset 查询 → Markdown 上下文 | 648 |
| `superset-frontend-new/src/config/weeklyReportPrompt.ts` | Prompt 模板：定义报告结构与 LLM 指令 | 164 |
| `superset-frontend-new/src/components/AiDrawer.tsx` | UI 编排：用户交互、流式渲染、钻取建议 | 1095 |

**整体流程**：`用户点击"生成周报"` → `startWeeklyReport` → `fetchWeeklyReportData` 拉取 4 路数据 → 组装 Markdown 上下文 → 拼接到 Prompt → 流式调用 LLM → 解析 `DRILL_DOWN_SUGGESTIONS` 渲染钻取建议。

---

## 二、问题诊断与优化点

### 🔴 高优先级（性能 / 正确性）

#### O1. 4 路独立 API 请求，未合并为批量调用
**位置**：`weeklyReport.ts:196-241`

```ts
const [qMedia, qChannel, qPlatform, qLtvTrend] = await Promise.all([
  api.post("/chart/data", { ...queries: [{...}] }),
  api.post("/chart/data", { ...queries: [{...}] }),
  api.post("/chart/data", { ...queries: [{...}] }),
  api.post("/chart/data", { ...queries: [{...}] }),
]);
```

Superset `/chart/data` 原生支持 `queries: [q1, q2, q3, q4]` 批量请求，4 次串行连接开销（TCP 握手、鉴权 header、CSRF 等）可一次性完成。

**影响**：网络 RTT × 4（~4× 延迟），请求头冗余。

**优化**：合并为单次 `api.post("/chart/data", { queries: [qMedia, qChannel, qPlatform, qLtvTrend] })`，返回 `result[0..3]` 对应 4 个查询。

**附带**：`dailyReport.ts:94-134` 同样存在此问题（5 路独立请求），可一并修复。

---

#### O2. 周次标签计算重复且易错
**位置**：`weeklyReport.ts:249-250`

```ts
const week1Label = `${extractDateStr(w1Start.getTime())}-${extractDateStr(new Date(w1Start.getTime() + 6 * 86400000).getTime())}`;
const week2Label = `${extractDateStr(w2Start.getTime())}-${extractDateStr(new Date(w2Start.getTime() + 6 * 86400000).getTime())}`;
```

`w1End` / `w2End` 已计算好（line 132 返回值），却没用，而是手动 `+ 6 * 86400000` 加 6 天。逻辑等价但读起来难懂。

**优化**：直接用 `w1End` / `w2End`：
```ts
const week1Label = `${extractDateStr(w1Start.getTime())}-${extractDateStr(w1End.getTime())}`;
const week2Label = `${extractDateStr(w2Start.getTime())}-${extractDateStr(w2End.getTime())}`;
```

---

#### O3. 注释与代码不一致
**位置**：`weeklyReport.ts:192-194` vs `:235`

注释写「按「主游戏 + 渠道商 + 日期」聚合」，但 `columns` 实际是 `["主游戏", "日期"]`，**没有渠道商**。导致 LTV 表格按项目汇总而非按项目+渠道（可能是有意为之，但注释必须修正）。

**优化**：修正注释，或显式按需选择列。

---

#### O4. `startDailyReport` 与 `startWeeklyReport` 重复代码
**位置**：`AiDrawer.tsx:336-416`

两个函数 ~80% 逻辑完全相同（创建 thread → 添加占位消息 → 拉数据 → 拼接 prompt → 流式输出 → 抽取钻取建议 → 错误处理），仅数据源和 prompt 模板不同。

**优化**：抽出通用 `startReport<T>(config: { label, fetchData, promptTemplate, reportPrompt })`，消除 ~80 行重复。

---

#### O5. `dateRangeRef` 仅在日报/周报中设置，普通对话钻取无日期上下文
**位置**：`AiDrawer.tsx:183, 339, 385, 422-424`

`startNewChat`（line 310）不设置 `dateRangeRef`，导致用户在非报告会话中点钻取建议时，附加的 `[...]` 日期范围为空。LLM 缺少时间窗口信息，分析可能错位。

**优化**：
- 允许在创建 thread 时携带 context 元数据（`dateRange`），由 thread 自身管理而非 ref；
- 或在 `handleSend` 中允许业务方传入额外 prefix。

---

### 🟡 中优先级（健壮性 / 可维护性）

#### O6. `as unknown[]` 类型逃逸
**位置**：`weeklyReport.ts:200, 210, 220, 230`

```ts
metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
```

混用对象（`COST_METRIC`）和字符串（`"cpa"`），强制 `as unknown[]` 才能编译通过。后端是否真正接受字符串短引用也未验证（Superset 通常要求完整 `expressionType` 描述）。

**优化**：
- 抽出 `type SupersetMetric = SimpeMetric | SavedMetric`；
- 所有指标统一为 `COST_METRIC` / `USER_METRIC` 对象形式（与 `cpa` / `roi_1` 在 Superset 中已保存的 saved metrics 一致），无需 cast。

---

#### O7. `extractDrillDownSuggestions` 三种解析策略过于脆弱
**位置**：`AiDrawer.tsx:102-140`

按优先级依次尝试 `|` 分隔 → 无序列表 → 成对 `标签：xxx / 指令：xxx`。每种 fallback 解决历史 bug，未来再加格式又要补一层。

**优化**：
- 在 prompt 中**统一**为一种格式（推荐无序列表，与周报 prompt 中已使用的格式一致）；
- 简化 parser 为单格式解析，删除向后兼容的兜底代码。

---

#### O8. Prompt 中的 section 顺序与数据不一致
**位置**：`weeklyReportPrompt.ts:43, 155` vs `weeklyReport.ts:562, 603, 618, 633`

Prompt 期望的报告顺序是：
```
一、核心指标概览（平台）
二、整体趋势 > 2.1 分项目数据 / 2.2 分渠道商数据 / 2.3 分媒体数据
```

数据实际生成顺序是：
```
## 分项目数据   (line 562)
## 分渠道商数据 (line 603)
## 核心指标概览 (line 618)  ← 出现在分项目之后
## 分媒体数据   (line 633)
```

LLM 需要自行重新排序，容易遗漏 / 错位。

**优化**：调整 `weeklyReport.ts` 中 sections 推入顺序为「核心指标概览 → 分项目 → 分渠道商 → 分媒体」，与 prompt 期望一致。

---

#### O9. 周报 Prompt 中报告日期为「当天日期」占位
**位置**：`weeklyReportPrompt.ts:49`

```md
**报告日期**: 当天日期
```

LLM 只能填"今天"但不知道具体日期，可能与数据的时间窗口（`week1Label` / `week2Label`）不一致。

**优化**：在拼 prompt 时由代码注入实际日期：
```ts
const fullPrompt = `... **报告日期**: ${new Date().toISOString().slice(0, 10)} ...`
```

---

#### O10. 周报数据无缓存
**位置**：`AiDrawer.tsx:377-416`

每次点击「生成周报」都重新拉 4 路 Superset 数据，耗时长且对后端压力大。

**优化**：
- 短期：组件级 `useRef` 缓存最近一次的 `summaryContext`，在 5 分钟内复用；
- 中期：抽到 zustand store 中支持跨会话复用（与 `useConversationStore` 类似）。

---

#### O11. 拉数据阶段无 loading 反馈
**位置**：`AiDrawer.tsx:336-375, 377-416`

```ts
addMessage(threadId, "user", { type: "text", body: "📊 正在从数据集查询两周数据..." });
```

只用文字提示，没有 spinner。如果后端慢，用户不知道是卡住还是没响应。

**优化**：
- 在占位消息中加 `<CircularProgress size={12} />`；
- 改用 `MessageBubble` 的 loading 状态（如果已支持）或新增 `loading_message` 类型。

---

#### O12. 中文字段名硬编码
**位置**：`weeklyReport.ts:257, 332, 353, 374, 497`

```ts
const name = String(r.媒体 ?? "");
const name = String(r.渠道商 ?? "");
const name = String(r.平台 ?? "");
const proj = String(r.主游戏 ?? "");
```

字段名是中文，重构时易拼错。Superset 实际返回的 colname 大小写 / 编码策略应被验证。

**优化**：抽出常量 `const COL = { MEDIA: "媒体", CHANNEL: "渠道商", ... } as const;`，集中管理。

---

#### O13. `dimensionTable` 中 W1 / W2 块完全对称代码重复
**位置**：`weeklyReport.ts:419-475`

`dimensionTable` 内部 W1 / W2 两块累加器初始化、行写入、合计行生成逻辑几乎完全相同。

**优化**：抽 `writeWeekBlock(label, names, getData, writeExtra, writeExtraSum)` 子函数，两侧各调用一次。

---

### 🟢 低优先级（清理 / DX）

#### O14. `dimensionTable` 末尾行 `| | | |${"|"}` 写法晦涩
**位置**：`weeklyReport.ts:448, 462`

```ts
lines.push(`| **${week1Label}** | | | |${"|"} `);
```

`${"|"}` 就是字符串 `" | "`，不如直接写为模板字面量最后一段。

**优化**：用 `lines.push(\`| **${week1Label}** | | | | |\`)` 即可。

---

#### O15. 重复的 `fmtW1` / `fmtW2`
**位置**：`weeklyReport.ts:568-569`

```ts
const fmtW1 = (v: number[]) => v.length === 7 ? v.map((x) => fmt(x)).join(" | ") : LTV_COLS.map(() => "-").join(" | ");
const fmtW2 = (v: number[]) => v.length === 7 ? v.map((x) => fmt(x)).join(" | ") : LTV_COLS.map(() => "-").join(" | ");
```

**优化**：合并为一个 `fmtLtvRow(v: number[])`。

---

#### O16. 类型 import 位置不规范
**位置**：`AiDrawer.tsx:64`

```ts
interface AiDrawerProps { ... }
import type { ChartData, DashboardFilterValue } from "@/types/api";
```

import 在 interface 之后，不符合 ESLint `import/first` 规则。

**优化**：移到文件顶部 import 区。

---

#### O17. 死代码 / 空分支
**位置**：`AiDrawer.tsx:220-224`

```ts
} else if (!open) {
  if (!isAssist) {
    // reset on close   ← 注释无代码
  }
}
```

**优化**：删除空分支或补全 `setActiveDoc(null); setSuggestions([]);` 逻辑（与 `handleClose` 重复，择一即可）。

---

#### O18. `rankAndGroup` 阈值与 `pcSorted` 阈值不一致
**位置**：`weeklyReport.ts:298` vs `:558`

两处都用 `totalW2 * 0.01`（1%），但没有共享常量。

**优化**：抽 `const MIN_DISPLAY_RATIO = 0.01` 常量。

---

#### O19. 知识卡片的 `prompt` 字段在文档卡片中不必要
**位置**：`AiDrawer.tsx:80-97`

`使用手册` / `技术架构` 卡片使用 `docKey`，无 prompt；其他卡片使用 prompt。两者同时存在但 `handleCardClick` 优先判断 `docKey`。

**优化**：让 `KnowledgeCard` 改为 discriminated union：
```ts
type KnowledgeCard =
  | { kind: "prompt"; title: string; description: string; icon: ReactNode; prompt: string }
  | { kind: "doc"; title: string; description: string; icon: ReactNode; docKey: string };
```

---

## 三、建议落地顺序

| 序号 | 优化点 | 预计工时 | 价值 |
|------|--------|----------|------|
| 1 | O1 合并 4 路 API 为批量 | 0.5h | 性能 ↑↑ |
| 2 | O2 复用 w1End/w2End | 5min | 可读性 ↑ |
| 3 | O3 修正注释 | 2min | 正确性 |
| 4 | O4 抽出 startReport 通用函数 | 1h | 维护性 ↑↑ |
| 5 | O8 调整 sections 顺序 | 5min | LLM 准确性 ↑ |
| 6 | O9 注入实际报告日期 | 10min | LLM 准确性 ↑ |
| 7 | O7 简化 drill-down parser | 30min | 健壮性 ↑ |
| 8 | O11 加 loading spinner | 15min | UX ↑ |
| 9 | O5 dateRangeRef → thread context | 30min | 一致性 ↑ |
| 10 | O6/O12 统一 metric / 字段名常量 | 30min | 类型安全 ↑ |
| 11 | O10 周报数据缓存 | 1h | 性能 ↑ |
| 12 | O13/O15 内部函数去重 | 20min | 可读性 |
| 13 | O14/O16/O17/O18/O19 清理 | 20min | DX |

---

## 四、不建议做的事

- **不要把 LLM 输出的 Markdown 重新解析成 React 树再渲染**：当前 `LightMdRenderer` 流式渲染体验良好，重新解析会带来 hydration 闪烁。
- **不要把 4 路查询改用 GraphQL**：Superset 不支持，改动 ROI 极低。
- **不要在 prompt 中加入「请使用 emoji」等装饰指令**：与 Superset 数据平台的克制风格冲突。

---

## 五、验证手段

1. 合并 API 后用 `curl` 验证批量返回 4 个 result 数组顺序与单查一致；
2. 修改 sections 顺序后跑 `startWeeklyReport` 一次，肉眼对比 LLM 输出结构；
3. 注入日期后检查生成的报告首行「报告日期: 2026-06-17」；
4. 抽 `startReport` 后跑日报 + 周报两路径，确认无 regression。
