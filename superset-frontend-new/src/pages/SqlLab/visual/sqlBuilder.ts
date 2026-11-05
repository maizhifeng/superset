import {
  dateTrunc,
  formatIdent,
  qualifyTable,
  supportsDefaultSchema,
  booleanLiteral,
} from "./dialects";
// 多阶段生成器：中间阶段 → CTE，最后阶段 → 最终 SELECT。
import {
  addDays,
  formatLiteral,
  likePattern,
  parseListValues,
  quoteLiteral,
  classifyColumn,
  type ColumnCategory,
} from "./operators";
import type {
  VisualFilterCondition,
  VisualHavingCondition,
  VisualMetric,
  VisualQueryModel,
  VisualStageView,
  VisualRef,
} from "./types";
import {
  finalStageIndex,
  isStageJoin,
  reachableStageIds,
  refKey,
  stageView,
  tableScope,
} from "./types";
import type { TableMetadata } from "@/types/api";

interface TableEntry {
  key: string;
  table: string;
  schema: string;
  alias: string;
}

interface BuildTables {
  base: TableEntry;
  joins: TableEntry[];
  byKey: Map<string, TableEntry>;
}

function buildTables(
  model: VisualStageView,
  defaultSchema?: string,
): BuildTables {
  const fallbackSchema = defaultSchema ?? model.schema;
  const entries: TableEntry[] = [
    {
      key: "base",
      table: model.table,
      schema: model.schema,
      alias: model.table,
    },
    ...model.joins.map((join) => ({
      key: join.id,
      table: join.table,
      schema: join.schema ?? fallbackSchema,
      alias: join.table,
    })),
  ];
  const used = new Map<string, number>();
  for (const entry of entries) {
    const seen = used.get(entry.alias) ?? 0;
    used.set(entry.alias, seen + 1);
    if (seen > 0) entry.alias = `${entry.alias}_${seen + 1}`;
  }
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return { base: entries[0], joins: entries.slice(1), byKey };
}

function columnExpr(
  entry: TableEntry,
  column: string,
  backend?: string,
): string {
  return `${formatIdent(backend, entry.alias)}.${formatIdent(backend, column)}`;
}

export function refExpr(
  model: VisualStageView,
  ref: VisualRef,
  backend?: string,
): string | null {
  if (ref.kind === "expression") {
    const expression = model.expressions.find((e) => e.id === ref.expressionId);
    // 返回表达式原文：作为指标函数参数 / SELECT 输出列时无需再包一层括号，
    // 需要分组的地方（如筛选左操作数）由调用方加括号。
    return expression?.sql.trim() || null;
  }
  if (!ref.joinId && model.joins.length === 0) {
    // 单表查询不存在歧义，列引用省略表前缀（`device_id` 而非
    // `sy_user_login_log.device_id`）；有 JOIN 时保留前缀用于消歧。
    return formatIdent(backend, ref.column);
  }
  const tables = buildTables(model);
  const entry = tables.byKey.get(ref.joinId ?? "base");
  if (!entry) return null;
  return columnExpr(entry, ref.column, backend);
}

function categoryForRef(
  model: VisualStageView,
  ref: VisualRef,
  tableMetas?: Record<string, TableMetadata>,
  defaultSchema?: string,
): ColumnCategory {
  if (ref.kind === "expression") return "other";
  const scope = tableScope(model, ref.joinId);
  const schema = scope.schema || (ref.joinId ? (defaultSchema ?? "") : "");
  if (!scope.table || !schema) return "other";
  // 共享元数据缓存使用 `数据库 id:模式:表` 作为键；测试/旧调用也兼容
  // `模式:表` 的简化键。
  const meta =
    tableMetas?.[`${model.databaseId}:${schema}:${scope.table}`] ??
    tableMetas?.[`${schema}:${scope.table}`];
  const column = meta?.columns.find((c) => c.name === ref.column);
  if (!column) return "other";
  return classifyColumn(column.type, column.longType);
}

export function defaultMetricLabel(metric: VisualMetric): string {
  if (metric.kind === "custom")
    return metric.customSql?.trim() ? "自定义指标" : "指标";
  if (metric.kind === "count") return "计数";
  const suffix =
    metric.ref?.kind === "column"
      ? metric.ref.column
      : metric.ref?.kind === "expression"
        ? "表达式"
        : "";
  const prefix: Record<string, string> = {
    count_distinct: "去重计数",
    sum: "求和",
    avg: "平均",
    min: "最小",
    max: "最大",
  };
  return suffix
    ? `${prefix[metric.kind] ?? metric.kind}_${suffix}`
    : (prefix[metric.kind] ?? metric.kind);
}

/**
 * 自定义指标 / 表达式只填聚合或行级 SQL，输出名请用「显示名」/「名称」。
 * 这里只识别结尾的 `AS 别名` 并给出明确提示，不做剥离或重写——把别名写进
 * SQL 会与生成器追加的别名冲突。
 */
const TRAILING_ALIAS_PATTERN =
  /\s+as\s+("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[(?:\]\]|[^\]])*\]|[A-Za-z_][A-Za-z0-9_$]*)\s*;?\s*$/i;

function hasInlineAlias(sql: string): boolean {
  return TRAILING_ALIAS_PATTERN.test(sql.trim());
}

function metricSql(
  model: VisualStageView,
  metric: VisualMetric,
  backend?: string,
): string | null {
  if (metric.kind === "custom") {
    // 自定义指标本身就是完整表达式，直接输出，避免生成 `(min(...))` 这类多余括号。
    return metric.customSql?.trim() || null;
  }
  if (metric.kind === "count") return "COUNT(*)";
  if (!metric.ref) return null;
  const expr = refExpr(model, metric.ref, backend);
  if (!expr) return null;
  switch (metric.kind) {
    case "count_distinct":
      return `COUNT(DISTINCT ${expr})`;
    case "sum":
      return `SUM(${expr})`;
    case "avg":
      return `AVG(${expr})`;
    case "min":
      return `MIN(${expr})`;
    case "max":
      return `MAX(${expr})`;
    default:
      return null;
  }
}

function filterConditionSql(
  model: VisualStageView,
  cond: VisualFilterCondition,
  tableMetas?: Record<string, TableMetadata>,
  backend?: string,
  defaultSchema?: string,
): string | null {
  const rawExpr = refExpr(model, cond.ref, backend);
  if (!rawExpr) return null;
  // 表达式作为筛选左操作数时加括号，避免 `a + b > c` 之类被后续 AND/OR 误组合；
  // 普通列引用保持原样。
  const expr = cond.ref.kind === "expression" ? `(${rawExpr})` : rawExpr;
  const category = categoryForRef(model, cond.ref, tableMetas, defaultSchema);
  const values = cond.values ?? [];
  const literal = (idx: number): string | null => {
    if (idx >= values.length) return formatLiteral(null, category);
    return formatLiteral(values[idx], category);
  };
  switch (cond.op) {
    case "is_null":
      return `${expr} IS NULL`;
    case "not_null":
      return `${expr} IS NOT NULL`;
    case "is_true":
      return `${expr} = ${booleanLiteral(backend, true)}`;
    case "is_false":
      return `${expr} = ${booleanLiteral(backend, false)}`;
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const value = literal(0);
      if (value === null) return null;
      const opSql: Record<string, string> = {
        eq: "=",
        neq: "<>",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
      };
      return `${expr} ${opSql[cond.op]} ${value}`;
    }
    case "contains":
    case "not_contains":
    case "starts_with":
    case "ends_with": {
      const raw = String(values[0] ?? "");
      if (raw === "") return null;
      const pattern = likePattern(raw);
      const like =
        cond.op === "contains" || cond.op === "not_contains"
          ? `%${pattern}%`
          : cond.op === "starts_with"
            ? `${pattern}%`
            : `%${pattern}`;
      const keyword = cond.op === "not_contains" ? "NOT LIKE" : "LIKE";
      return `${expr} ${keyword} ${quoteLiteral(like)} ESCAPE '\\'`;
    }
    case "in":
    case "not_in": {
      const list =
        values.length === 1 && typeof values[0] === "string"
          ? parseListValues(values[0])
          : values.map((v) => String(v ?? ""));
      const literals = list
        .filter((v) => v.trim() !== "")
        .map((v) => formatLiteral(v, category));
      if (literals.length === 0 || literals.some((l) => l === null))
        return null;
      const keyword = cond.op === "not_in" ? "NOT IN" : "IN";
      return `${expr} ${keyword} (${literals.join(", ")})`;
    }
    case "between": {
      const from = literal(0);
      const to = literal(1);
      if (from === null || to === null) return null;
      return `${expr} BETWEEN ${from} AND ${to}`;
    }
    case "date_on": {
      const day = String(values[0] ?? "");
      if (!day) return null;
      return `(${expr} >= ${quoteLiteral(day)} AND ${expr} < ${quoteLiteral(addDays(day, 1))})`;
    }
    case "date_before": {
      const day = String(values[0] ?? "");
      if (!day) return null;
      return `${expr} < ${quoteLiteral(day)}`;
    }
    case "date_after": {
      const day = String(values[0] ?? "");
      if (!day) return null;
      return `${expr} >= ${quoteLiteral(addDays(day, 1))}`;
    }
    case "date_between": {
      const from = String(values[0] ?? "");
      const to = String(values[1] ?? "");
      if (!from || !to) return null;
      return `(${expr} >= ${quoteLiteral(from)} AND ${expr} < ${quoteLiteral(addDays(to, 1))})`;
    }
    default:
      return null;
  }
}

function joinConditionsSql(
  model: VisualStageView,
  conds: VisualFilterCondition[],
  tableMetas?: Record<string, TableMetadata>,
  backend?: string,
  defaultSchema?: string,
): string | null {
  const parts: string[] = [];
  for (const cond of conds) {
    const sql = filterConditionSql(
      model,
      cond,
      tableMetas,
      backend,
      defaultSchema,
    );
    if (!sql) continue;
    if (parts.length === 0) {
      parts.push(sql);
    } else {
      parts.push(`${cond.connector === "or" ? "OR" : "AND"} ${sql}`);
    }
  }
  if (parts.length === 0) return null;
  return parts.map((p) => `  ${p}`).join("\n");
}

function havingConditionsSql(
  model: VisualStageView,
  conds: VisualHavingCondition[],
  backend?: string,
): string | null {
  const parts: string[] = [];
  for (const cond of conds) {
    const metric = model.metrics.find((m) => m.id === cond.metricId);
    if (!metric) continue;
    const expr = metricSql(model, metric, backend);
    if (!expr) continue;
    const values = cond.values ?? [];
    const from = formatLiteral(values[0] ?? null, "metric");
    const to = formatLiteral(values[1] ?? null, "metric");
    const opSql: Record<string, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    };
    let sql: string | null = null;
    if (cond.op === "between") {
      if (from !== null && to !== null)
        sql = `${expr} BETWEEN ${from} AND ${to}`;
    } else if (opSql[cond.op] && from !== null) {
      sql = `${expr} ${opSql[cond.op]} ${from}`;
    }
    if (!sql) continue;
    if (parts.length === 0) parts.push(sql);
    else parts.push(`${cond.connector === "or" ? "OR" : "AND"} ${sql}`);
  }
  if (parts.length === 0) return null;
  return parts.map((p) => `  ${p}`).join("\n");
}

function uniquify(label: string, used: Set<string>): string {
  const base = label || "column";
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

function dimLabel(model: VisualStageView, ref: VisualRef): string {
  if (ref.kind === "expression") {
    const expression = model.expressions.find((e) => e.id === ref.expressionId);
    return expression?.name?.trim() || "表达式";
  }
  return ref.column;
}

const LIMIT_MIN = 1;
const LIMIT_MAX = 100000;

function clampLimit(limit: number): number {
  return Math.min(
    LIMIT_MAX,
    Math.max(LIMIT_MIN, Math.floor(Number(limit) || LIMIT_MIN)),
  );
}

/**
 * 生成单个阶段的 SELECT（即旧版单阶段生成逻辑）。
 * defaultSchema 用于关联表的模式兜底（阶段来源为 CTE 时视图 schema 为空）。
 * includeOrderLimit 为 false 时跳过 ORDER BY / LIMIT（中间 CTE 无需）。
 */
function buildStageSelect(
  model: VisualStageView,
  backend: string | undefined,
  tableMetas: Record<string, TableMetadata> | undefined,
  defaultSchema: string,
  includeOrderLimit: boolean,
): string {
  if (!model.table) return "";
  const tables = buildTables(model, defaultSchema);
  const aggregated = model.groupBy.length > 0 || model.metrics.length > 0;
  const usedLabels = new Set<string>();

  const selectItems: string[] = [];
  const groupByItems: string[] = [];
  const labelByMetricId = new Map<string, string>();
  const labelByDimKey = new Map<string, string>();

  if (aggregated) {
    for (const dim of model.groupBy) {
      const expr = refExpr(model, dim.ref, backend);
      if (!expr) continue;
      const truncated = dim.dateUnit
        ? dateTrunc(backend, expr, dim.dateUnit)
        : null;
      const sql = truncated ?? expr;
      const label = uniquify(dimLabel(model, dim.ref), usedLabels);
      labelByDimKey.set(refKey(dim.ref), label);
      // 输出列名与分组列同名时省略别名（`device_id AS device_id` → `device_id`）。
      const redundantAlias =
        dim.ref.kind === "column" && !dim.dateUnit && label === dim.ref.column;
      selectItems.push(
        redundantAlias ? sql : `${sql} AS ${formatIdent(backend, label)}`,
      );
      groupByItems.push(sql);
    }
    for (const metric of model.metrics) {
      const expr = metricSql(model, metric, backend);
      if (!expr) continue;
      const label = uniquify(
        metric.label.trim() || defaultMetricLabel(metric),
        usedLabels,
      );
      labelByMetricId.set(metric.id, label);
      selectItems.push(`${expr} AS ${formatIdent(backend, label)}`);
    }
  } else {
    if (model.columns.length === 0) {
      selectItems.push("*");
    }
    for (const column of model.columns) {
      const source = column.source;
      const expr = refExpr(model, source, backend);
      if (!expr) continue;
      const defaultAlias =
        source.kind === "expression"
          ? model.expressions.find((e) => e.id === source.expressionId)?.name
          : undefined;
      const alias = column.alias?.trim() || defaultAlias;
      // 显式别名与列名完全相同时省略别名。
      const redundantAlias =
        source.kind === "column" && alias === source.column;
      if (alias && !redundantAlias) {
        const label = uniquify(alias, usedLabels);
        selectItems.push(`${expr} AS ${formatIdent(backend, label)}`);
      } else {
        selectItems.push(expr);
      }
    }
  }
  if (selectItems.length === 0) selectItems.push("*");

  const lines: string[] = [];
  lines.push("SELECT");
  lines.push(selectItems.map((item) => `  ${item}`).join(",\n"));

  // 选择了默认模式且引擎会把该模式设为会话默认时，省略模式前缀
  // （SQL 实验室 execute 请求会携带 schema，后端据此设置 search_path 等）。
  const omitDefaultSchema = supportsDefaultSchema(backend);
  const from = qualifyTable(
    backend,
    model.schema,
    model.table,
    omitDefaultSchema && Boolean(model.schema) && model.schema === defaultSchema,
  );
  lines.push(
    tables.base.alias === model.table
      ? `FROM ${from}`
      : `FROM ${from} AS ${formatIdent(backend, tables.base.alias)}`,
  );

  for (const join of model.joins) {
    const entry = tables.byKey.get(join.id);
    if (!entry) continue;
    const joinType = (join.type ?? "left").toUpperCase();
    const target = qualifyTable(
      backend,
      entry.schema,
      join.table,
      omitDefaultSchema &&
        Boolean(entry.schema) &&
        entry.schema === defaultSchema,
    );
    const targetRef = `${
      entry.alias === join.table
        ? target
        : `${target} AS ${formatIdent(backend, entry.alias)}`
    }`;
    const keys: string[] = [];
    for (const key of join.keys) {
      const left = tables.byKey.get(key.left.joinId ?? "base");
      const right = tables.byKey.get(key.right.joinId ?? "base");
      if (!left || !right) continue;
      keys.push(
        `${columnExpr(left, key.left.column, backend)} = ${columnExpr(right, key.right.column, backend)}`,
      );
    }
    if (keys.length === 0) {
      lines.push(`CROSS JOIN ${targetRef}`);
    } else {
      lines.push(`${joinType} JOIN ${targetRef} ON ${keys.join(" AND ")}`);
    }
  }

  const where = joinConditionsSql(
    model,
    model.filters,
    tableMetas,
    backend,
    defaultSchema,
  );
  if (where) lines.push(`WHERE\n${where}`);

  if (groupByItems.length > 0) {
    lines.push(
      `GROUP BY\n${groupByItems.map((item) => `  ${item}`).join(",\n")}`,
    );
  }

  const having = havingConditionsSql(model, model.having, backend);
  if (having) lines.push(`HAVING\n${having}`);

  if (includeOrderLimit) {
    const orderItems: string[] = [];
    for (const sort of model.sorts) {
      let orderExpr: string | null = null;
      if (aggregated) {
        if (sort.ref.kind === "metric") {
          const label = labelByMetricId.get(sort.ref.metricId);
          if (label) orderExpr = formatIdent(backend, label);
        } else {
          const label = labelByDimKey.get(refKey(sort.ref));
          if (label) orderExpr = formatIdent(backend, label);
        }
      } else {
        if (sort.ref.kind !== "metric") {
          orderExpr = refExpr(model, sort.ref, backend);
        }
      }
      if (!orderExpr) continue;
      orderItems.push(`${orderExpr} ${sort.desc ? "DESC" : "ASC"}`);
    }
    if (orderItems.length > 0) {
      lines.push(
        `ORDER BY\n${orderItems.map((item) => `  ${item}`).join(",\n")}`,
      );
    }

    lines.push(`LIMIT ${clampLimit(model.limit)}`);
  }

  return lines.join("\n");
}

function indentSql(sql: string, spaces = 2): string {
  const pad = " ".repeat(spaces);
  return sql
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

/**
 * 生成完整查询：最终输出阶段作为外层 SELECT，其依赖（数据来源与关联的
 * 上游阶段）按阶段顺序渲染为 WITH 中的 CTE。阶段彼此独立，未被最终输出
 * 阶段引用的草稿阶段不会进入 SQL。单阶段时与旧版输出一致（无 WITH）。
 * Comment-free：模型注释仅在持久化时添加（见 modelIO.embedModel）。
 */
export function buildSql(
  model: VisualQueryModel,
  backend?: string,
  tableMetas?: Record<string, TableMetadata>,
): string {
  const stages = model.stages ?? [];
  if (stages.length === 0) return "";
  const finalIndex = finalStageIndex(model);
  if (finalIndex < 0) return "";
  const reachable = reachableStageIds(model);

  const ctes: string[] = [];
  let finalSelect = "";
  let missingDependency = false;
  stages.forEach((stage, index) => {
    if (!reachable.has(stage.id)) return;
    const view = stageView(model, stage);
    const isFinal = index === finalIndex;
    if (!view.table) {
      // 最终输出阶段依赖的上游阶段尚未配置：不生成半截 SQL。
      if (!isFinal) missingDependency = true;
      return;
    }
    const select = buildStageSelect(
      view,
      backend,
      tableMetas,
      model.schema,
      isFinal,
    );
    if (!select) return;
    if (isFinal) {
      finalSelect = select;
    } else {
      ctes.push(
        `${formatIdent(backend, stage.name)} AS (\n${indentSql(select)}\n)`,
      );
    }
  });
  if (missingDependency || !finalSelect) return "";
  if (ctes.length === 0) return finalSelect;
  return `WITH\n  ${ctes.join(",\n  ")}\n${finalSelect}`;
}

function validateViewForRun(
  view: VisualStageView,
  prefix: string,
): string | null {
  if (!view.table) return `${prefix}请先选择数据源`;
  for (const join of view.joins) {
    const target = isStageJoin(join)
      ? `上游阶段 ${join.table}`
      : `关联表 ${join.table}`;
    if (join.keys.length === 0) return `${prefix}${target} 缺少关联键`;
    for (const key of join.keys) {
      if (!key.left.column || !key.right.column) {
        return `${prefix}${target} 的关联键不完整`;
      }
    }
  }
  const hasValue = (c: { values: (string | number | null)[] }, min: number) =>
    (c.values ?? []).filter(
      (v) => v !== null && v !== undefined && String(v).trim() !== "",
    ).length >= min;
  for (const filter of view.filters) {
    if (filter.op === "is_null" || filter.op === "not_null") continue;
    if (filter.op === "is_true" || filter.op === "is_false") continue;
    if (filter.op === "in" || filter.op === "not_in") {
      if (!hasValue(filter, 1)) return `${prefix}筛选条件「属于」缺少取值`;
      continue;
    }
    if (filter.op === "between" || filter.op === "date_between") {
      if (!hasValue(filter, 2)) return `${prefix}筛选条件「介于」需要两个取值`;
      continue;
    }
    if (!hasValue(filter, 1)) return `${prefix}筛选条件缺少取值`;
  }
  for (const expression of view.expressions) {
    if (hasInlineAlias(expression.sql)) {
      return `${prefix}表达式只填 SQL，「名称」请另填（不要写 AS 别名）`;
    }
  }
  for (const metric of view.metrics) {
    if (metric.kind === "custom") {
      if (!metric.customSql?.trim()) return `${prefix}自定义指标缺少表达式`;
      if (hasInlineAlias(metric.customSql)) {
        return `${prefix}自定义指标只填聚合表达式，「显示名」请另填（不要写 AS 别名）`;
      }
      continue;
    }
    if (metric.kind !== "count" && !metric.ref) {
      return `${prefix}指标缺少字段`;
    }
  }
  for (const having of view.having) {
    if (!view.metrics.some((m) => m.id === having.metricId)) {
      return `${prefix}HAVING 条件引用了不存在的指标`;
    }
    if (having.op === "between") {
      if (!hasValue(having, 2))
        return `${prefix}HAVING 条件「介于」需要两个取值`;
    } else if (!hasValue(having, 1)) {
      return `${prefix}HAVING 条件缺少取值`;
    }
  }
  for (const sort of view.sorts) {
    const ref = sort.ref;
    if (ref.kind === "metric") {
      if (!view.metrics.some((m) => m.id === ref.metricId)) {
        return `${prefix}排序引用了不存在的指标`;
      }
    } else if (!refExpr(view, ref)) {
      return `${prefix}排序引用了不存在的字段`;
    }
  }
  return null;
}

/**
 * Returns the first blocking reason preventing execution, or null.
 *
 * Stage sources must always point at an existing earlier stage (data integrity),
 * while unfinished independent draft stages are allowed: only stages reachable
 * from the final output stage need a complete configuration.
 */
export function validateModelForRun(model: VisualQueryModel): string | null {
  const stages = model.stages ?? [];
  if (stages.length === 0) return "请先选择数据表";
  const finalIndex = finalStageIndex(model);
  if (finalIndex < 0) return "请先选择数据源";
  const reachable = reachableStageIds(model);
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const prefix = stages.length > 1 ? `阶段 ${i + 1}：` : "";
    if (stage.source.kind === "stage") {
      const sourceIndex = stages.findIndex(
        (s) => s.id === (stage.source as { stageId: string }).stageId,
      );
      if (sourceIndex < 0) return `${prefix}上游阶段不存在`;
      if (sourceIndex >= i) return `${prefix}只能引用更早的阶段`;
    }
    for (const join of stage.joins) {
      if (!isStageJoin(join)) continue;
      const targetIndex = stages.findIndex((s) => s.id === join.stageId);
      if (targetIndex < 0) return `${prefix}关联的上游阶段不存在`;
      if (targetIndex >= i) return `${prefix}只能关联更早的阶段`;
    }
    if (!reachable.has(stage.id)) continue;
    const reason = validateViewForRun(stageView(model, stage), prefix);
    if (reason) return reason;
  }
  return null;
}
