import { JOIN_TYPE_LABELS } from "./dialects";
import { describeGroupBy, describeRef } from "./describe";
import { operatorLabel } from "./operators";
import { defaultMetricLabel } from "./sqlBuilder";
import { isAggregated } from "./types";
import type { BuilderContext } from "./components/builderContext";

/**
 * Human-readable one-line summaries shown on collapsed step cards. Kept in a
 * separate module so the step components only export components (react-refresh).
 */

export function dataSourceSummary(ctx: BuilderContext): string {
  if (!ctx.model.table) return "未选择数据表";
  return `${ctx.model.schema ? `${ctx.model.schema}.` : ""}${ctx.model.table}`;
}

export function joinSummary(ctx: BuilderContext): string {
  if (ctx.model.joins.length === 0) return "未添加关联表";
  return ctx.model.joins
    .map((j) => {
      const schema = j.schema ?? ctx.model.schema;
      const scope =
        schema && schema !== ctx.model.schema
          ? `${schema}.${j.table}`
          : j.table;
      return `${JOIN_TYPE_LABELS[j.type] ?? j.type} ${scope}`;
    })
    .join("；");
}

export function columnsSummary(ctx: BuilderContext): string {
  if (isAggregated(ctx.model)) return "汇总模式下由分组与指标决定输出";
  const count = ctx.model.columns.length;
  if (count === 0) return "未选择输出列（输出全部列）";
  return (
    ctx.model.columns
      .slice(0, 4)
      .map((c) => describeRef(ctx.model, c.source))
      .join("、") + (count > 4 ? ` 等 ${count} 列` : "")
  );
}

export function filtersSummary(ctx: BuilderContext): string {
  if (ctx.model.filters.length === 0) return "未设置筛选条件";
  return (
    ctx.model.filters
      .slice(0, 2)
      .map((f) => {
        const ref = describeRef(ctx.model, f.ref);
        const values = f.values
          .filter((v) => v !== null && v !== undefined && String(v) !== "")
          .map((v) => String(v))
          .join(" ~ ");
        return `${ref} ${operatorLabel(f.op)} ${values}`.trim();
      })
      .join("；") + (ctx.model.filters.length > 2 ? " …" : "")
  );
}

export function summarySummary(ctx: BuilderContext): string {
  if (ctx.model.metrics.length === 0 && ctx.model.groupBy.length === 0) {
    return "未启用汇总（输出明细行）";
  }
  const parts: string[] = [];
  if (ctx.model.groupBy.length > 0) {
    parts.push(
      "分组：" +
        ctx.model.groupBy
          .slice(0, 3)
          .map((g) => describeGroupBy(ctx.model, g.ref, g.dateUnit))
          .join("、"),
    );
  }
  if (ctx.model.metrics.length > 0) {
    parts.push(
      "指标：" +
        ctx.model.metrics
          .slice(0, 3)
          .map((m) => m.label.trim() || defaultMetricLabel(m))
          .join("、"),
    );
  }
  return parts.join("； ");
}

export function sortSummary(ctx: BuilderContext): string {
  const sorts = ctx.model.sorts
    .map((s) => {
      const ref = s.ref;
      let label: string;
      if (ref.kind === "metric") {
        const metric = ctx.model.metrics.find((m) => m.id === ref.metricId);
        label = metric
          ? metric.label.trim() || defaultMetricLabel(metric)
          : "指标";
      } else {
        label = describeRef(ctx.model, ref);
      }
      return `${label} ${s.desc ? "↓" : "↑"}`;
    })
    .join("、");
  return `${sorts || "默认顺序"}；最多 ${ctx.model.limit} 行`;
}
