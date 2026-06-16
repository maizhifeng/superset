import api from "@/api";
import { executeQuery } from "@/api/querySuperset";

interface ModelConfig {
  provider: string;
  model: string;
  baseUrl?: string;
}

export interface InsightCallbacks {
  onText: (text: string) => void;
  onReasoning?: (text: string) => void;
  onStatus?: (status: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

/** OpenAI 流式 tool_call delta 分段 */
interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

/** 累积完成的 tool call */
interface CompletedToolCall {
  index: number;
  id: string;
  type: string;
  name: string;
  arguments: string;
}

/**
 * query_superset 工具的 OpenAI function-calling 定义。
 * 参数 schema 与 QuerySupersetParams 对齐。
 */
const QUERY_SUPERSET_TOOL = {
  type: "function" as const,
  function: {
    name: "query_superset",
    description:
      "从广告投放数据集（数据集 26）查询按维度聚合的数据，返回 markdown 表格。columns 必须包含「日期」以展示分天趋势，可附加其他维度。各维度含义：日期=数据日期，媒体=广告投放平台（微信/抖音/华为等），平台=操作系统（iOS/Android），渠道商=具体合作渠道，主游戏=游戏项目名，团队=运营团队。metrics 指定聚合指标（如 SUM(消耗)）。示例：columns=[\"日期\", \"媒体\"], metrics=[\"SUM(消耗)\", \"cpa\"], time_range=\"Last 7 days\"",
    parameters: {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: {
            type: "string",
            enum: ["日期", "媒体", "平台", "渠道商", "主游戏", "团队"],
          },
          description: "分组维度：日期=数据日期，媒体=广告投放平台（微信/抖音/华为），平台=操作系统（iOS/Android），渠道商=具体合作渠道，主游戏=游戏项目，团队=运营团队。必须包含「日期」。",
        },
        metrics: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "SUM(消耗)", "SUM(返点后消耗)", "SUM(新增进入)",
              "cpa", "roi_1", "roi_2", "roi_3", "roi_4", "roi_5", "roi_6", "roi_7",
              "ltv_1", "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7",
            ],
          },
          description: "查询指标",
        },
        time_range: {
          type: "string",
          enum: ["Last 7 days", "Last 14 days", "Last 30 days", "Last 90 days"],
          description: "时间范围，默认 Last 14 days",
          optional: true,
        },
        filters: {
          type: "object",
          description: "列级过滤条件。当分析指定了具体游戏/渠道/媒体时，必须传入对应的过滤条件。如 {\"主游戏\":\"三国：天命再临\"} 或 {\"渠道商\":\"微信小游戏\"}",
          optional: true,
        },
        orderby: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: [{ type: "string" }, { type: "boolean" }],
          },
          description: "排序，如 [[\"SUM(消耗)\", false]]",
          optional: true,
        },
        row_limit: {
          type: "number",
          maximum: 1000,
          description: "返回行数上限，默认 100",
          optional: true,
        },
      },
      required: ["columns", "metrics", "time_range"],
    },
  },
};

// --- Chart data helpers ---

function parseChartInfo(resp: Record<string, unknown>) {
  const r = (resp.result || {}) as Record<string, unknown>;
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse((r.params as string) || "{}");
  } catch {
    /* */
  }
  const fd = (r.form_data as Record<string, unknown>) || params;
  return {
    dsId: (r.datasource_id as number) || (fd.datasource_id as number) || 0,
    dsType:
      (r.datasource_type as string) ||
      (fd.datasource_type as string) ||
      "table",
    metrics: (fd.metrics as unknown[]) || [],
    groupby: ((fd.groupby as string[]) || []).map(String),
    vizType: (r.viz_type as string) || (fd.viz_type as string) || "",
    name: (r.slice_name as string) || `#${r.id}`,
  };
}

type FilterMeta = { value?: unknown; column?: string; filterType?: string };
function buildFilterInfo(filters: Record<string, unknown>) {
  const lines: string[] = [];
  const qf: Record<string, unknown>[] = [];
  for (const [, v] of Object.entries(filters)) {
    const i = v as FilterMeta;
    if (
      i.filterType === "time_range" &&
      Array.isArray(i.value) &&
      i.value.length >= 2 &&
      i.column
    ) {
      lines.push(`  ${i.column}: ${i.value[0]} ~ ${i.value[1]}`);
      qf.push({ col: i.column, op: ">=", val: i.value[0] });
      qf.push({ col: i.column, op: "<=", val: i.value[1] });
    } else if (i.filterType === "filter_select" && i.column) {
      const arr = Array.isArray(i.value) ? i.value : [i.value];
      lines.push(`  ${i.column} IN [${arr.join(", ")}]`);
      qf.push({ col: i.column, op: "IN", val: arr });
    }
  }
  return {
    text: lines.length ? "当前筛选条件:\n" + lines.join("\n") : "",
    query: qf,
  };
}

// --- Direct LLM streaming (OpenAI-compatible SSE) ---

function _yieldToReact(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function _streamLlmDirect(
  system: string,
  prompt: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
) {
  callbacks.onStatus?.("正在获取回答…");

  const rawBaseUrl = modelCfg?.baseUrl || "";
  const baseUrl = /(?:172\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|host\.docker\.internal)/.test(rawBaseUrl)
    ? "/llm"
    : rawBaseUrl || "/llm";
  const model = modelCfg?.model || "gemma-4-e2b-it";

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  if (history) messages.push(...history);
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.1,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM API error: ${res.status} ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          callbacks.onDone?.();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            callbacks.onText(content);
            await _yieldToReact();
          }
        } catch {
          /* skip malformed JSON */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  callbacks.onDone?.();
}

// --- Public API ---

export async function streamChartInsight(
  chartId: number,
  filters: Record<string, unknown>,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
): Promise<string> {
  callbacks.onStatus?.("正在获取图表元数据…");
  const infoResp = await api
    .get(`/chart/${chartId}`, { signal })
    .catch((e: Error) => {
      throw new Error(`获取图表信息失败: ${e.message}`);
    });
  const info = parseChartInfo(infoResp.data);
  if (!info.dsId) throw new Error("图表数据源 ID 为空");
  const fi = buildFilterInfo(filters);

  callbacks.onStatus?.("正在查询数据…");
  const ROW_LIMIT = 500;
  const payload: Record<string, unknown> = {
    datasource: { id: info.dsId, type: info.dsType },
    queries: [
      {
        metrics: info.metrics.slice(0, 10),
        columns: info.groupby.slice(0, 5),
        row_limit: ROW_LIMIT,
      },
    ],
    result_format: "json",
    result_type: "full",
  };
  if (fi.query.length)
    (payload.queries as Record<string, unknown>[])[0].filters = fi.query;

  const dataResp = await api.post("/chart/data", payload, { signal });
  const first =
    (Array.isArray(dataResp.data?.result)
      ? dataResp.data.result[0]
      : dataResp.data?.result) || {};
  const data: Record<string, unknown>[] = first.data || [];
  const colnames: string[] = first.colnames || [];
  const totalCount = first.rowcount ?? data.length;

  callbacks.onStatus?.("数据获取完成");

  const shortNames = colnames.map((c: string) =>
    c.replace(/^SUM\(/, "").replace(/\)$/, ""),
  );
  const sorted = [...data].sort((a, b) => {
    const va =
      Number(Object.values(a).find((v) => typeof v === "number")) || 0;
    const vb =
      Number(Object.values(b).find((v) => typeof v === "number")) || 0;
    return vb - va;
  }).slice(0, ROW_LIMIT);
  const tableStr = [
    shortNames.join("\t"),
    ...sorted.map((r) =>
      shortNames
        .map((_, i) => {
          const v = r[colnames[i]];
          return v == null
            ? "-"
            : typeof v === "number"
              ? Number.isInteger(v)
                ? String(v)
                : v.toFixed(2)
              : String(v);
        })
        .join("\t"),
    ),
  ].join("\n");

  const truncNote =
    totalCount > ROW_LIMIT
      ? `⚠️ 共 ${totalCount} 行，仅展示消耗最高的 ${ROW_LIMIT} 行，缺失 ${totalCount - ROW_LIMIT} 行`
      : totalCount >= ROW_LIMIT
        ? `⚠️ 达到查询上限 ${ROW_LIMIT} 行，可能存在截断`
        : null;

  const contextLines = [
    `图表: ${info.name}`,
    `类型: ${info.vizType}`,
    `数据行: ${sorted.length}`,
    `数据列: ${shortNames.join(", ")}`,
  ];
  if (truncNote) contextLines.push(truncNote);
  if (fi.text) contextLines.push(`\n${fi.text}`);
  const dataBlock = sorted.length ? `\n数据:\n${tableStr}` : "";

  callbacks.onStatus?.("正在分析…");
  const system =
    "你是一个专业的数据分析师。请直接分析下面给出的图表数据，输出结构化的分析结果（趋势、异常、建议等），使用中文和 markdown 格式。不要生成或执行任何代码。";
  const text = `分析图表 #${chartId} 的数据。\n\n图表上下文:\n${contextLines.join("\n")}${dataBlock}`;

  await _streamLlmDirect(system, text, callbacks, signal, modelCfg);
  return "";
}

export async function streamChat(
  _sessionId: string,
  message: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
) {
  await _streamLlmDirect("", message, callbacks, signal, modelCfg, history);
}

export async function abortSession(_sessionId: string) {
  /* no-op with direct LLM mode */
}

export async function streamDirectChat(
  prompt: string,
  systemPrompt: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
): Promise<string> {
  await _streamLlmDirect(systemPrompt, prompt, callbacks, signal, modelCfg, history);
  return "";
}

// ─── Tool-calling stream ──────────────────────────────────

/**
 * 带 function calling 的流式对话。
 *
 * 流程：
 * 1. 发送 messages + query_superset 工具定义
 * 2. LLM 可能返回 text（直接输出）或 tool_calls（请求查询数据）
 * 3. 如果 LLM 调用了 query_superset，执行查询并将结果附加到 messages
 * 4. 继续下一轮对话，最多 MAX_ROUNDS 轮
 * 5. 将最终文本内容流式推送给 onText 回调
 *
 * @param system - 系统提示词
 * @param prompt - 用户消息
 * @param callbacks - 回调
 * @param signal - AbortSignal
 * @param modelCfg - 模型配置
 * @param history - 历史消息
 * @returns LLM 最终回复的完整文本
 */
export async function streamWithTools(
  system: string,
  prompt: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
): Promise<string> {
  const rawBaseUrl = modelCfg?.baseUrl || "";
  const baseUrl = /(?:172\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|host\.docker\.internal)/.test(rawBaseUrl)
    ? "/llm"
    : rawBaseUrl || "/llm";
  const model = modelCfg?.model || "gemma-4-e2b-it";

  const toolSystem = [
    "你是一个专业的数据分析师助手，内置于数据平台中。",
    "你可以使用 query_superset 工具从广告投放数据集中按需查询聚合数据。",
    "该工具返回标准的 Markdown 表格，表头即为你请求的列名。",
    "",
    "### 使用方法",
    "columns 参数指定分组维度，metrics 参数指定聚合指标，time_range 指定时间范围。",
    "工具会自动按 columns 中的维度分组聚合后返回。",
    "例如：columns=[\"日期\", \"平台\"], metrics=[\"SUM(消耗)\", \"SUM(新增进入)\", \"cpa\"], time_range=\"Last 7 days\"",
    "→ 返回每天每个平台的消耗、新增用户、CPA 表格。",
    "",
    "**重要：钻取分析时必须包含「日期」在 columns 中，以展示分天趋势，不得仅返回汇总值。**",
    "",
    "### 钻取分析规范",
    "钻取分析时，必须使用 query_superset 工具查询分天的详细数据（columns 包含「日期」），不得仅依赖已有的周汇总数据进行结论。",
    "分析应以逐日视角展开，如「6/7 消耗突然上升至 X，6/8 回落至 Y」，而非仅比较 W1→W2 汇总值。",
    "展示数据表格时，行按日期升序排列，让用户能直观看到每日变化趋势。",
    "",
    "### 钻取查询规则",
    "用户消息以「📊 钻取分析 [日期范围]」开头，根据方括号中的日期范围选取最合适的 time_range（如 14 天用 Last 14 days），如不确定则不传（默认 Last 14 days）。",
    "分析方向文本中提到的具体实体（如游戏名「三国：天命再临」、渠道名「微信小游戏」）必须作为列级过滤条件（filters）传入 query_superset，同时将对应的维度列包含在 columns 中。",
    "示例：用户说「按日查看命再临各渠道消耗趋势」→ columns=[\"日期\",\"主游戏\",\"渠道商\"], filters={\"主游戏\":\"三国：天命再临\"}",
    "",
    "### 维度说明（用户问什么维度就用什么列）",
    "columns 支持以下中文维度列名，用户提到某维度时必须使用对应的列名，不得混淆：",
    "- 日期：数据发生的日期",
    "- 媒体：广告投放平台，如微信、抖音、华为、腾讯等（==> 用 columns=[\"日期\", \"媒体\"]）",
    "- 平台：操作系统平台，如 iOS、Android（==> 用 columns=[\"日期\", \"平台\"]）",
    "- 渠道商：具体的合作渠道名称，如微信小游戏、天拓手游、官网Appstore（==> 用 columns=[\"日期\", \"渠道商\"]）",
    "- 主游戏：游戏项目名称（==> 用 columns=[\"日期\", \"主游戏\"]）",
    "- 团队：运营团队名称（==> 用 columns=[\"日期\", \"团队\"]）",
    "",
    "metrics 支持以下指标名：",
    "- SUM(消耗)：广告消耗金额",
    "- SUM(返点后消耗)：返点后广告消耗（用于计算 CPA/ROI）",
    "- SUM(新增进入)：新增用户数",
    "- cpa：获客成本",
    "- roi_1 ~ roi_7：ROI（百分比，如 8.95 = 8.95%，直接显示）",
    "- ltv_1 ~ ltv_7：LTV（生命周期价值）",
    "",
    "### LTV 曲线分析",
    "用户提到「LTV曲线」「LTV走势」「LTV差异」时，指对比不同维度下 ltv_1 到 ltv_7 的完整序列。",
    "在 metrics 中同时传入 ltv_1 ~ ltv_7 即可获得每日各 LTV 指标值，通过对比 LTV7/LTV1 增长系数评估用户留存质量。",
    "示例：metrics=[\"SUM(消耗)\", \"ltv_1\", \"ltv_2\", \"ltv_3\", \"ltv_4\", \"ltv_5\", \"ltv_6\", \"ltv_7\"]",
    "",
    "### 输出规范",
    "- 使用**中文**输出，Markdown 格式",
    "- 数据优先：先展示 query_superset 返回的数据表格（原样复制，不得修改列名、数据或添加/删除行），再给出分析和结论",
    "- 表格使用标准 Markdown 表格（| 列1 | 列2 |）",
    "",
    "### 指标业务含义解读",
    "分析指标变化时需要结合业务逻辑：",
    "- 消耗 ↑ + 新增用户 ↑ + CPA ↓ → 健康增长，获客效率提升",
    "- 消耗 ↑ + 新增用户 ↓ + CPA ↑ → 获客效率恶化，需排查渠道/素材/定向问题",
    "- ROI1 ↓ → 首日付费转化或付费金额下降，可能用户质量变差",
    "- ROI1 ↑ → 首日回收效果改善",
    "- LTV 增长系数（LTV7/LTV1）高 → 用户留存和长期价值好",
    "- LTV 曲线整体偏低 → 用户付费能力或留存不足",
    "",
    "- 数值按可读性格式化：整数显示整数，小数保留 2 位，不要出现「0.01万」之类",
    "- 新增用户数整数显示",
    "- ROI 值已经是百分比，直接显示（如 8.95 → 8.95%）",
    "- 变化率显示为 ±X% 格式",
    "- 输出分析时必须标明数据日期范围",
    "- **禁止使用 LaTeX 数学语法**（$...$、\\frac 等），所有公式用普通文本",
    "- 不要输出思考过程或规划步骤，只输出最终分析结果",
    "- 只能基于实际查询到的数据进行分析，不得输出推测性、假设性或「可能」类的不确定结论，无数据支撑的结论不写",
    "",
  ].join("\n");
  const effectiveSystem = system ? `${system}\n\n${toolSystem}` : toolSystem;

  type Msg = Record<string, unknown>;
  const messages: Msg[] = [];
  if (effectiveSystem) messages.push({ role: "system", content: effectiveSystem });
  if (history) messages.push(...history);
  messages.push({ role: "user", content: prompt });

  const MAX_ROUNDS = 5;
  let fullText = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.1,
        tools: [QUERY_SUPERSET_TOOL],
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM API error: ${res.status} ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";
    let roundText = "";
    const toolCallMap = new Map<number, CompletedToolCall>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              roundText += delta.content;
              fullText += delta.content;
              callbacks.onText(delta.content);
              await _yieldToReact();
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls as ToolCallDelta[]) {
                const idx = tc.index;
                if (!toolCallMap.has(idx)) {
                  toolCallMap.set(idx, { index: idx, id: "", type: "function", name: "", arguments: "" });
                }
                const acc = toolCallMap.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.type) acc.type = tc.type;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.arguments += tc.function.arguments;
              }
            }
          } catch {
            /* skip malformed JSON */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls = [...toolCallMap.values()];

    // 如果没有 tool_calls 或全部无效 → 本轮结束
    if (toolCalls.length === 0 || toolCalls.every((tc) => !tc.id)) {
      callbacks.onDone?.();
      return fullText;
    }

    // 追加 assistant 消息（含 tool_calls）
    messages.push({
      role: "assistant",
      content: roundText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    callbacks.onStatus?.("正在查询数据…");

    // 执行所有 tool call
    for (const tc of toolCalls) {
      if (!tc.id || tc.name !== "query_superset") continue;
      try {
        const args = JSON.parse(tc.arguments);
        const result = await executeQuery(args);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      } catch (e: unknown) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `查询失败: ${(e as Error).message}`,
        });
      }
    }

    callbacks.onStatus?.("正在分析数据…");
    // 继续下一轮
  }

  callbacks.onDone?.();
  return fullText;
}
