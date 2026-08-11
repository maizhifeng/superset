import type { InsightCallbacks } from "@/api/aiInsight";
import { executeQuery } from "@/api/querySuperset";

export const QUERY_SUPERSET_TOOL = {
  type: "function" as const,
  function: {
    name: "query_superset",
    description:
      '从广告投放数据集（数据集 26）查询按维度聚合的数据，返回 markdown 表格。columns 必须包含「日期」以展示分天趋势，可附加其他维度。各维度含义：日期=数据日期，媒体=广告投放平台（微信/抖音/华为等），平台=操作系统（iOS/Android），渠道商=具体合作渠道，主游戏=游戏项目名，团队=运营团队。metrics 指定聚合指标（如 SUM(消耗)）。示例：columns=["日期", "媒体"], metrics=["SUM(消耗)", "cpa"], time_range="Last 7 days"',
    parameters: {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: {
            type: "string",
            enum: ["日期", "媒体", "平台", "渠道商", "主游戏", "团队"],
          },
          description:
            "分组维度：日期=数据日期，媒体=广告投放平台（微信/抖音/华为），平台=操作系统（iOS/Android），渠道商=具体合作渠道，主游戏=游戏项目，团队=运营团队。必须包含「日期」。",
        },
        metrics: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "SUM(消耗)",
              "SUM(返点后消耗)",
              "SUM(新增进入)",
              "cpa",
              "roi_1",
              "roi_2",
              "roi_3",
              "roi_4",
              "roi_5",
              "roi_6",
              "roi_7",
              "ltv_1",
              "ltv_2",
              "ltv_3",
              "ltv_4",
              "ltv_5",
              "ltv_6",
              "ltv_7",
            ],
          },
          description: "查询指标",
        },
        time_range: {
          type: "string",
          enum: ["Last 2 days", "Last 7 days", "Last 14 days", "Last 30 days", "Last 90 days"],
          description: "时间范围，默认 Last 14 days",
          optional: true,
        },
        filters: {
          type: "object",
          description:
            '列级过滤条件。当分析指定了具体游戏/渠道/媒体时，必须传入对应的过滤条件。如 {"主游戏":"三国：天命再临"} 或 {"渠道商":"微信小游戏"}',
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
          description: '排序，如 [["SUM(消耗)", false]]',
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

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface CompletedToolCall {
  index: number;
  id: string;
  type: string;
  name: string;
  arguments: string;
}

export async function executeToolCalls(
  toolCalls: CompletedToolCall[],
  messages: Record<string, unknown>[],
  callbacks: InsightCallbacks,
): Promise<void> {
  callbacks.onStatus?.("正在查询数据…");

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
}
