export interface TableSection {
  title: string;
  headers: string[];
  rows: string[][];
  summary?: string;
}

/**
 * Structured output envelope. The agent decides the report structure itself:
 * either free-form markdown (preferred) or the legacy summary/tables/
 * analysis/recommendations slots (still supported for backward compat).
 */
export interface AgentStructuredOutput {
  summary?: string;
  /** Free-form markdown report body; structure is decided by the model. */
  markdown?: string;
  tables?: TableSection[];
  analysis?: string[];
  recommendations?: string[];
}

function buildMarkdownTable(headers: string[], rows: string[][]): string {
  if (headers.length === 0) return "";
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, separatorLine, ...bodyLines].join("\n");
}

export function isValidStructuredOutput(
  data: unknown,
): data is AgentStructuredOutput {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (obj.summary !== undefined && typeof obj.summary !== "string")
    return false;
  if (obj.markdown !== undefined && typeof obj.markdown !== "string")
    return false;
  if (
    obj.analysis !== undefined &&
    (!Array.isArray(obj.analysis) ||
      !obj.analysis.every((a) => typeof a === "string"))
  )
    return false;
  if (
    obj.recommendations !== undefined &&
    (!Array.isArray(obj.recommendations) ||
      !obj.recommendations.every((r) => typeof r === "string"))
  )
    return false;
  if (obj.tables !== undefined) {
    if (!Array.isArray(obj.tables)) return false;
    for (const table of obj.tables) {
      if (!table || typeof table !== "object") return false;
      const t = table as Record<string, unknown>;
      if (typeof t.title !== "string") return false;
      if (
        !Array.isArray(t.headers) ||
        !t.headers.every((h) => typeof h === "string")
      )
        return false;
      if (
        !Array.isArray(t.rows) ||
        !t.rows.every(
          (r) => Array.isArray(r) && r.every((c) => typeof c === "string"),
        )
      )
        return false;
    }
  }
  return true;
}

export function renderStructuredOutput(output: AgentStructuredOutput): string {
  const parts: string[] = [];

  if (output.summary) {
    parts.push(output.summary);
    parts.push("");
  }

  // Free-form markdown body takes precedence; the agent decides its own
  // sections, tables and bullet structure.
  if (output.markdown) {
    parts.push(output.markdown.trim());
    return parts.join("\n").trim();
  }

  if (output.tables) {
    for (const table of output.tables) {
      if (table.headers.length > 0 && table.rows.length > 0) {
        parts.push(`### ${table.title}`);
        parts.push("");
        parts.push(buildMarkdownTable(table.headers, table.rows));
        parts.push("");
      }
      if (table.summary) {
        parts.push(`> ${table.summary}`);
        parts.push("");
      }
    }
  }

  if (output.analysis && output.analysis.length > 0) {
    parts.push("### 分析要点");
    parts.push("");
    for (const point of output.analysis) {
      parts.push(`- ${point}`);
    }
    parts.push("");
  }

  if (output.recommendations && output.recommendations.length > 0) {
    parts.push("### 优化建议");
    parts.push("");
    for (const rec of output.recommendations) {
      parts.push(`- ${rec}`);
    }
  }

  return parts.join("\n").trim();
}

export function tryRenderStructuredContent(text: string): string | null {
  const trimmed = text.trim();

  const candidates: string[] = [];
  // 1. The whole output is a JSON object/array
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    candidates.push(trimmed);
  }
  // 2. A ```json fenced block embedded anywhere in the output
  const blockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (blockMatch) {
    candidates.push(blockMatch[1].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isValidStructuredOutput(parsed)) {
        return renderStructuredOutput(parsed);
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function buildFallbackOutput(toolResultText: string): string {
  if (!toolResultText.trim()) {
    return "（无法获取查询数据，请重新尝试）";
  }
  return [
    "### 数据查询结果",
    "",
    "以下是查询到的数据：",
    "",
    toolResultText,
    "",
    "> 以上数据基于 query_superset 工具查询结果。",
  ].join("\n");
}
