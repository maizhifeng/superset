# 修复钻取分析数据管道（动态查询方案）

## 问题

钻取功能拥有完整的数据查询层（`drillDown.ts`）和提示词层（`drillDownPrompt.ts`），但它们从未与 UI（`AiDrawer.tsx`）连接。当用户点击钻取建议时，只有纯文本发送给 AI，没有任何实际数据 —— AI 只能凭空回答。

此外，当前 `drillDown.ts` 仅提供 4 组固定维度查询（项目+渠道、媒体、平台、团队+渠道），但 AI 生成的钻取建议可能涉及任意维度组合（如"项目×媒体"、"渠道×平台"），固定查询无法覆盖所有场景。

## 核心思路

**让 AI 同时生成可机器解析的查询参数**：在日/周报 prompt 的 `DRILL_DOWN_SUGGESTIONS` 段落中，要求 AI 为每条建议附带一个 JSON 查询参数块。前端解析后直接用于构建 Superset 查询。

```
## DRILL_DOWN_SUGGESTIONS

- 按日查看三国：天命再临在各渠道的消耗和 CPA 趋势，分析各渠道每日波动及优化方向
  ```json
  {"columns":["主游戏","渠道商","日期"],"metrics":["消耗","cpa"],"filters":[{"col":"主游戏","val":"三国：天命再临"}],"time_range":"Last 7 days"}
  ```
```

**优点**：
- 无需额外 AI 往返（解析+查询合并为一步）
- 查询精确匹配用户问题，无冗余数据
- JSON 块在 Markdown 中自然隐藏，不影响可读性
- 向后兼容：无 JSON 的建议回退到固定查询

## 涉及文件与改动

---

### 第 1 步：`dailyReportPrompt.ts` / `weeklyReportPrompt.ts` — 修改建议输出格式

在 DRILL_DOWN_SUGGESTIONS 段落中增加 JSON 查询参数要求：

```markdown
输出格式：Markdown 无序列表，每行一条建议，直接写出分析方向。
在每条建议下方紧跟一个 JSON 代码块，指定查询参数：

可用的 columns: "主游戏", "渠道商", "媒体", "平台", "团队", "日期"
可用的 metrics: "消耗", "新增", "cpa", "roi1", "ltv1", "ltv2", "ltv3", "ltv4", "ltv5", "ltv6", "ltv7"
time_range 固定为 "Last 7 days"
filters 为可选数组，每项包含 col 和 val

示例：
- 按日查看 A 项目在各渠道间的消耗和 CPA 趋势
  ```json
  {"columns":["主游戏","渠道商","日期"],"metrics":["消耗","cpa"],"filters":[{"col":"主游戏","val":"A项目"}],"time_range":"Last 7 days"}
  ```
```

---

### 第 2 步：`AiDrawer.tsx` — 更新解析逻辑和接口

#### 2a. 更新 `DrillDownSuggestion` 接口

```typescript
interface DrillDownQuery {
  columns: string[];
  metrics: string[];           // 紧凑名，如 "消耗", "cpa"
  filters?: { col: string; val: string }[];
  time_range: string;
}

interface DrillDownSuggestion {
  label: string;
  prompt: string;
  query?: DrillDownQuery;      // 可选，无则为回退模式
  loading?: boolean;
  analyzed?: boolean;
}
```

#### 2b. 更新 `extractDrillDownSuggestions`

```typescript
function extractDrillDownSuggestions(text: string): DrillDownSuggestion[] {
  const idx = text.lastIndexOf(DRILL_DOWN_MARKER);
  if (idx === -1) return [];
  const block = text.slice(idx + DRILL_DOWN_MARKER.length).trim();

  // Split by list items, each may have a ```json``` block after
  const suggestions: DrillDownSuggestion[] = [];
  const parts = block.split(/\n(?=[-*]\s)/); // split before each list item

  for (const part of parts) {
    const lines = part.split("\n");
    const labelLine = lines[0].replace(/^[-*]\s+/, "").trim();
    if (labelLine.length <= 5) continue;

    // Try to extract JSON query params
    const jsonMatch = part.match(/```json\s*([\s\S]*?)```/);
    let query: DrillDownQuery | undefined;
    if (jsonMatch) {
      try {
        query = JSON.parse(jsonMatch[1]);
      } catch { /* ignore malformed JSON */ }
    }

    suggestions.push({ label: labelLine, prompt: labelLine, query });
  }

  return suggestions;
}
```

---

### 第 3 步：`drillDown.ts` — 重构为通用查询 + 回退查询

#### 3a. 新增指标名映射

```typescript
const METRIC_MAP: Record<string, SupersetMetric> = {
  "消耗": COST_METRIC,
  "新增": USER_METRIC,
  "cpa": "cpa",
  "roi1": "roi_1",
  "ltv1": "ltv_1",
  "ltv2": "ltv_2",
  "ltv3": "ltv_3",
  "ltv4": "ltv_4",
  "ltv5": "ltv_5",
  "ltv6": "ltv_6",
  "ltv7": "ltv_7",
};
```

#### 3b. 新增通用查询函数 `queryDrillDown`

```typescript
export async function queryDrillDown(params: {
  columns: string[];
  metrics: string[];
  filters?: { col: string; val: string }[];
  time_range: string;
  row_limit?: number;
}): Promise<DrillDownData> {
  const metrics: SupersetMetric[] = params.metrics.map(m => METRIC_MAP[m] ?? m);

  const query: Record<string, unknown> = {
    metrics,
    columns: params.columns,
    granularity: "日期",
    time_range: params.time_range,
    orderby: [["SUM(ad_real_cost)", false]],
    row_limit: params.row_limit ?? 300,
  };

  // Build adhoc_filters if filters are provided
  if (params.filters?.length) {
    // ... Superset simple adhoc filter format
  }

  const resp = await api.post("/chart/data", {
    datasource: DATASOURCE,
    queries: [query],
    result_format: "json",
    result_type: "full",
  });

  const { rows, cols } = parseResult(resp);
  normalizeDates(rows);

  // Compute date range
  const dates = [...new Set(rows.map(r => String(r.日期)).filter(Boolean))]
    .sort();
  const dateRange = dates.length
    ? `${dates[0]} ~ ${dates[dates.length-1]}`
    : "近7天";

  const summaryContext = [
    `数据范围: ${dateRange}`, "",
    toMarkdownTable(cols, rows, 300),
  ].join("\n");

  return { summaryContext, dateRange };
}
```

#### 3c. 保留 `fetchDrillDownData` 作为回退

当建议没有附带 JSON 查询参数时，使用现有的 4 组固定查询（略微扩展覆盖更多维度组合）。

#### 3d. `DrillDownData` 接口增加 `dateRange`

```typescript
export interface DrillDownData {
  summaryContext: string;
  dateRange: string;
}
```

---

### 第 4 步：`AiDrawer.tsx` — 重构 `startDrillDown`

```typescript
const startDrillDown = async (suggestion: DrillDownSuggestion, index: number) => {
  setSuggestions(prev => prev.map((s, i) =>
    i === index ? { ...s, loading: true } : s
  ));

  setDataLoading(true);
  try {
    // 动态查询 或 回退
    let data: DrillDownData;
    if (suggestion.query) {
      data = await queryDrillDown(suggestion.query);
    } else {
      // 回退：使用固定 4 组查询
      const cached = drillDownCacheRef.current;
      if (cached && Date.now() - cached.timestamp < DRILLDOWN_CACHE_TTL) {
        data = { summaryContext: cached.summaryContext, dateRange: cached.dateRange };
      } else {
        data = await fetchDrillDownData();
        drillDownCacheRef.current = { timestamp: Date.now(), ...data };
      }
    }

    dateRangeRef.current = data.dateRange;

    const dateInjectedPrompt = DRILL_DOWN_PROMPT.replace("{dateRange}", data.dateRange);
    const fullPrompt = [
      dateInjectedPrompt,
      "",
      "### 钻取明细数据",
      "",
      data.summaryContext,
      "",
      `请根据以上数据，完成以下钻取分析任务：${suggestion.prompt}`,
    ].join("\n");

    const threadId = createThread();
    addMessage(threadId, "user", { type: "text", body: `📊 钻取分析 [${data.dateRange}]: ${suggestion.label}` });

    setStreamingText("");
    const full = await stream(fullPrompt, [], (t) => setStreamingText(t));
    setStreamingText("");
    addMessage(threadId, "assistant", { type: "text", body: stripDrillDownSection(full) });

    // 二级建议
    const secondary = extractDrillDownSuggestions(full);
    if (secondary.length > 0) {
      setSuggestions(secondary);
    } else {
      setSuggestions(prev => prev.map((s, i) =>
        i === index ? { ...s, analyzed: true, loading: false } : s
      ));
    }
  } catch {
    setStreamingText("");
    addMessage(createThread(), "assistant", {
      type: "error",
      message: "钻取数据查询失败，请稍后重试",
      retryable: true,
    });
    setSuggestions(prev => prev.map((s, i) =>
      i === index ? { ...s, loading: false } : s
    ));
  } finally {
    setDataLoading(false);
  }
};
```

#### 4a. 更新建议列表 onClick 调用

```tsx
// 从
onClick={() => startDrillDown(s.prompt, i)}
// 改为
onClick={() => startDrillDown(s, i)}
```

---

### 第 5 步：`drillDownPrompt.ts` — 修正列名映射

将列名映射表更新为与 Superset 实际输出列名一致（`主游戏`、`渠道商`、`SUM(ad_real_cost)` 等），添加 `{dateRange}` 占位符。

---

## 改动后数据流

```
用户点击钻取建议
  ├─ 建议有 query 参数 → queryDrillDown(params) 动态查询
  │    └─ 针对性 Superset 查询（精确维度+指标+过滤）
  └─ 建议无 query 参数 → fetchDrillDownData() 回退
       └─ 4 组固定维度查询（缓存 5 分钟）
  → 数据 + DRILL_DOWN_PROMPT + 分析任务 → 流式发送 AI
  → AI 基于实际数据返回分析
  → 提取二级钻取建议（如有）
```

## 边界情况

| 场景 | 处理 |
|------|------|
| AI 未生成 JSON 参数 | 回退到固定 4 组查询 |
| JSON 格式错误 | 忽略，回退到固定查询 |
| 指标名未在 METRIC_MAP 中 | 原样传给 Superset |
| 连续点击同一建议 | loading 状态阻止；analyzed 样式不变 |
| 钻取响应含新建议 | 替换当前建议列表 |
