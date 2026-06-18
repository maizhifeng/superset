export const DRILL_DOWN_COLUMNS = `"主游戏", "渠道商", "媒体", "平台", "团队", "日期"`;
export const DRILL_DOWN_METRICS = `"消耗", "新增", "cpa", "roi1", "ltv1", "ltv2", "ltv3", "ltv4", "ltv5", "ltv6", "ltv7"`;

export const DRILL_DOWN_FORMAT = `输出格式：Markdown 无序列表，每行一条建议，直接写出分析方向。
在每条建议下方紧跟一个 JSON 代码块，指定查询参数：

可用的 columns: ${DRILL_DOWN_COLUMNS}
可用的 metrics: ${DRILL_DOWN_METRICS}
time_range 固定为 "Last 7 days"
filters 为可选数组，每项包含 col 和 val

示例：
- 按日查看 A 项目在各渠道间的消耗和 CPA 趋势，分析各渠道每日波动及优化方向
  \`\`\`json
  {"columns":["主游戏","渠道商","日期"],"metrics":["消耗","cpa"],"filters":[{"col":"主游戏","val":"A项目"}],"time_range":"Last 7 days"}
  \`\`\``;
