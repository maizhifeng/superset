import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Report data-fetch configuration for the Pi agent.
 *
 * The agent uses the pi-coding-agent built-in runtime (no custom system
 * prompt, no custom tools). Periodic report requests (daily/weekly/monthly)
 * are served by fetching each configured analysis perspective directly
 * through the Superset chart data API and handing the data to the built-in
 * agent to write the report.
 *
 * The JSON file is the source of truth; the defaults below are a safety net
 * that matches the committed `agent-config.json` and must be kept in sync
 * with it.
 */

export type OrderbyValue = string | [string, boolean][];

export interface ReportPerspective {
  /** Display name, e.g. "平台维度" */
  name: string;
  /** Short description shown to the model, e.g. "近 7 天变化趋势" */
  description: string;
  /** Dimension columns, e.g. ["日期", "平台"] */
  columns: string[];
  /** Metrics, e.g. ["SUM(新增进入)", "cpa"] */
  metrics: string[];
  /** Order-by: array form or human-friendly string ("日期↑") */
  orderby?: OrderbyValue;
  /** Render "show_all=true（数据量大不截断）" when true */
  showAll?: boolean;
  /** Row cap for the injected data table */
  rowLimit?: number;
  /** Two-step drilldown: dimension column to rank, e.g. "主游戏" */
  topBy?: string;
  /** Two-step drilldown: metric used for ranking, e.g. "SUM(消耗)" */
  topMetric?: string;
  /** Two-step drilldown: how many top values to keep */
  topN?: number;
}

export interface AgentConfig {
  report: {
    /** Time range used for report scenarios, e.g. "Last 7 days" */
    defaultTimeRange: string;
    /** Analysis perspectives; each one gets its own query in reports */
    perspectives: ReportPerspective[];
  };
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  report: {
    defaultTimeRange: "Last 7 days",
    perspectives: [
      {
        name: "平台维度",
        description: "新增进入、消耗、充值流水 近 7 天变化趋势",
        columns: ["日期", "平台"],
        metrics: ["SUM(新增进入)", "SUM(消耗)", "SUM(充值流水)"],
        orderby: [
          ["平台", true],
          ["日期", true],
        ],
      },
      {
        name: "主游戏维度",
        description:
          "按消耗排名前 10 的主游戏，新增进入、消耗、cpa、ltv_1~ltv_7 近 7 天变化趋势",
        columns: ["日期", "主游戏"],
        metrics: [
          "SUM(新增进入)",
          "SUM(消耗)",
          "cpa",
          "ltv_1",
          "ltv_2",
          "ltv_3",
          "ltv_4",
          "ltv_5",
          "ltv_6",
          "ltv_7",
        ],
        orderby: "日期↑",
        topBy: "主游戏",
        topMetric: "SUM(消耗)",
        topN: 10,
      },
      {
        name: "重点主游戏 × 渠道商维度",
        description:
          "按消耗排名前 5 的主游戏，其下各渠道商近 7 天变化趋势",
        columns: ["日期", "主游戏", "渠道商"],
        metrics: ["SUM(新增进入)", "SUM(消耗)", "cpa"],
        orderby: "日期↑",
        topBy: "主游戏",
        topMetric: "SUM(消耗)",
        topN: 5,
        rowLimit: 400,
      },
      {
        name: "平台 × 媒体维度",
        description: "近 7 天变化趋势",
        columns: ["日期", "平台", "媒体"],
        metrics: ["SUM(新增进入)", "SUM(消耗)", "SUM(充值流水)"],
        orderby: "日期↑",
        rowLimit: 500,
      },
    ],
  },
};

function resolveConfigPath(): string {
  const override = process.env.AGENT_CONFIG_PATH;
  if (override) return override;
  // The JSON file lives next to the package (../agent-config.json), not in src/
  return fileURLToPath(new URL("../agent-config.json", import.meta.url));
}

function mergeConfig(
  base: AgentConfig,
  override: Partial<AgentConfig>,
): AgentConfig {
  return {
    report: {
      defaultTimeRange:
        override.report?.defaultTimeRange ?? base.report.defaultTimeRange,
      perspectives: override.report?.perspectives ?? base.report.perspectives,
    },
  };
}

let cachedConfig: AgentConfig | null = null;

/** Load the report config from the JSON file (falls back to defaults). */
export function loadAgentConfig(): AgentConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = readFileSync(resolveConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    cachedConfig = mergeConfig(DEFAULT_AGENT_CONFIG, parsed);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `agent-config: failed to load ${resolveConfigPath()}, using defaults: ${String(err)}`,
    );
    cachedConfig = DEFAULT_AGENT_CONFIG;
  }
  return cachedConfig;
}

/** Clear the cached config (used by tests). */
export function resetAgentConfigCache(): void {
  cachedConfig = null;
}
